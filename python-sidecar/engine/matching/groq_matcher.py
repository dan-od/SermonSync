"""Groq cloud LLM fallback for Stage 3 (SS-050).

When there's no local GGUF model but a Groq API key is configured, the LLM
matcher routes to Groq's (OpenAI-compatible) chat-completions API instead of the
heuristic mock. Uses stdlib urllib so no extra dependency is added; the HTTP
transport is injectable for testing.

Config (persisted in the app.db settings via ConfigStore):
  groq_enabled  : bool
  groq_api_key  : str
  groq_model    : str (default llama-3.3-70b-versatile)

Graceful degradation: any API error returns [] (the orchestrator then falls
through to Stage 4), and never crashes the pipeline. Unlike the first cut of
this module, degradation is no longer *silent* — every failure is classified and
recorded on the matcher (see `health()`), which /api/groq/status reports.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.request

from .llm_matcher import PROMPT_TEMPLATE, _hydrate, _parse_refs

logger = logging.getLogger("sermonsync.matching.groq")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"

# Groq's edge (Cloudflare) rejects urllib's default "Python-urllib/3.x"
# User-Agent with 403 Forbidden / "error code: 1010" BEFORE the request ever
# reaches the API, so even a perfectly valid key fails. Always send a real UA.
USER_AGENT = os.environ.get("GROQ_USER_AGENT", "SermonSync/0.1 (sermonsync-sidecar)")

# Groq console keys are "gsk_" + ~52 chars of base62. The prefix + length check
# catches placeholders ("gsk_fake") and truncated pastes before we spend a
# round-trip — and before the UI can claim the key is "Connected".
_KEY_RE = re.compile(r"^gsk_[A-Za-z0-9]{20,}$")

# Failures that will never fix themselves without operator action. Once one of
# these is seen the circuit stays open until the matcher is reconfigured, so a
# bad key does not mean one failed HTTPS call per transcribed sentence.
_HARD_KINDS = frozenset({"auth", "blocked", "model", "config"})
_FAILURES_BEFORE_TRIP = 3
_COOLDOWN_SECONDS = 30.0


class GroqError(RuntimeError):
    """A classified Groq failure. `kind` drives operator-facing messaging."""

    def __init__(
        self,
        kind: str,
        message: str,
        status: int | None = None,
        retryable: bool = False,
        hint: str | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.status = status
        self.retryable = retryable
        self.hint = hint

    @property
    def is_hard(self) -> bool:
        return self.kind in _HARD_KINDS

    def as_dict(self) -> dict:
        out = {"kind": self.kind, "message": self.message, "retryable": self.retryable}
        if self.status is not None:
            out["status"] = self.status
        if self.hint:
            out["hint"] = self.hint
        return out


def describe_key_problem(api_key: str | None) -> str | None:
    """Return a human-readable reason the key is unusable, or None if it looks ok.

    Format-only — it cannot tell a revoked key from a live one, but it does
    reject the placeholders that previously sailed through to /status as
    `linked: true`.
    """
    if api_key is None or not api_key.strip():
        return "no Groq API key stored"
    key = api_key.strip()
    if key != api_key:
        return "API key has leading/trailing whitespace"
    if not key.startswith("gsk_"):
        return "API key does not start with 'gsk_' — copy it from console.groq.com"
    if not _KEY_RE.match(key):
        return (
            f"API key is malformed or a placeholder ({len(key)} chars; real Groq "
            "keys are ~56)"
        )
    return None


def _default_transport(url: str, headers: dict, body: dict | None, timeout: float = 20.0) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url, data=data, headers=headers, method="POST" if data else "GET"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _from_http_error(exc: urllib.error.HTTPError) -> GroqError:
    """Turn an HTTPError into a classified GroqError, reading the response body.

    The body matters: a bare "HTTP Error 403: Forbidden" is indistinguishable
    between "key rejected" and "edge blocked the client", which is exactly the
    ambiguity that made this bug hard to see.
    """
    try:
        raw = exc.read().decode("utf-8", "replace").strip()
    except Exception:  # pragma: no cover - body already consumed
        raw = ""

    detail, code = raw, None
    try:
        payload = json.loads(raw)
        err = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(err, dict):
            detail = err.get("message") or raw
            code = err.get("code")
    except (json.JSONDecodeError, AttributeError, TypeError):
        pass

    status = exc.code

    # Cloudflare rejects the client before Groq sees it (403 + "error code: 1010").
    if status == 403 and "1010" in raw:
        return GroqError(
            "blocked",
            "Groq's edge blocked the request (Cloudflare error 1010) — the HTTP "
            "client is being rejected on its User-Agent, not on the API key",
            status,
            hint=f"send a real User-Agent header (currently {USER_AGENT!r})",
        )
    if code in {"model_not_found", "model_decommissioned"} or (
        status == 404 and "model" in detail.lower()
    ):
        return GroqError(
            "model",
            detail or f"model unavailable (HTTP {status})",
            status,
            hint="pick a current model from console.groq.com/docs/models",
        )
    if status in (401, 403):
        return GroqError(
            "auth",
            detail or "API key rejected by Groq",
            status,
            hint="regenerate the key at console.groq.com/keys",
        )
    if status == 429:
        return GroqError("rate_limit", detail or "rate limited by Groq", status, retryable=True)
    if status >= 500:
        return GroqError(
            "server", detail or f"Groq server error (HTTP {status})", status, retryable=True
        )
    return GroqError("http", detail or f"HTTP {status}: {exc.reason}", status)


def _classify(exc: BaseException) -> GroqError:
    if isinstance(exc, GroqError):
        return exc
    if isinstance(exc, urllib.error.HTTPError):
        return _from_http_error(exc)
    if isinstance(exc, urllib.error.URLError):
        return GroqError("network", f"could not reach Groq: {exc.reason}", retryable=True)
    if isinstance(exc, TimeoutError):
        return GroqError("timeout", "Groq request timed out", retryable=True)
    if isinstance(exc, OSError):
        return GroqError("network", f"network error calling Groq: {exc}", retryable=True)
    if isinstance(exc, (KeyError, IndexError, TypeError, ValueError)):
        return GroqError("parse", f"unexpected Groq response shape: {exc!r}")
    return GroqError("unknown", f"{type(exc).__name__}: {exc}")


class GroqMatcher:
    stage = 3
    is_mock = False
    backend = "groq"

    def __init__(self, api_key: str, model: str = DEFAULT_GROQ_MODEL, transport=None,
                 temperature: float = 0.1, max_tokens: int = 256) -> None:
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self._transport = transport or _default_transport

        self._lock = threading.Lock()
        self._last_error: GroqError | None = None
        self._last_error_at: float | None = None
        self._last_success_at: float | None = None
        self._consecutive_failures = 0
        self._calls = 0
        self._failures = 0
        self._circuit_open_until: float | None = None  # None = closed, inf = hard-open
        self._logged_error_kind: str | None = None

    # --- headers ------------------------------------------------------
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Required: without it urllib sends "Python-urllib/3.x", which the
            # Groq edge 403s (Cloudflare 1010) before authenticating.
            "User-Agent": USER_AGENT,
        }

    # --- health bookkeeping -------------------------------------------
    def _record_success(self) -> None:
        with self._lock:
            self._calls += 1
            self._last_success_at = time.time()
            self._consecutive_failures = 0
            self._last_error = None
            self._last_error_at = None
            self._circuit_open_until = None
            self._logged_error_kind = None

    def _record_failure(self, err: GroqError) -> None:
        with self._lock:
            self._calls += 1
            self._failures += 1
            self._consecutive_failures += 1
            self._last_error = err
            self._last_error_at = time.time()
            if err.is_hard:
                self._circuit_open_until = float("inf")
            elif self._consecutive_failures >= _FAILURES_BEFORE_TRIP:
                self._circuit_open_until = time.time() + _COOLDOWN_SECONDS
            first_of_kind = self._logged_error_kind != err.kind
            self._logged_error_kind = err.kind
            failures = self._consecutive_failures

        # Log the first occurrence of each distinct failure loudly; repeats go to
        # DEBUG so a broken key doesn't bury the log at one line per sentence.
        detail = f"{err.message}{f' ({err.hint})' if err.hint else ''}"
        if first_of_kind:
            log = logger.error if err.is_hard else logger.warning
            log(
                "Stage 3 Groq call failed [%s]%s: %s%s",
                err.kind,
                f" HTTP {err.status}" if err.status else "",
                detail,
                " — disabling Groq until reconfigured" if err.is_hard else "",
            )
        else:
            logger.debug("Groq still failing [%s] (%d consecutive): %s", err.kind, failures, detail)

    def _circuit_blocked(self) -> GroqError | None:
        with self._lock:
            until, err = self._circuit_open_until, self._last_error
        if until is None:
            return None
        if until != float("inf") and time.time() >= until:
            with self._lock:
                self._circuit_open_until = None
            return None
        return err

    def health(self) -> dict:
        """Operator-facing snapshot — this is what /api/groq/status surfaces."""
        with self._lock:
            open_until = self._circuit_open_until
            err = self._last_error
            return {
                "model": self.model,
                "calls": self._calls,
                "failures": self._failures,
                "consecutive_failures": self._consecutive_failures,
                "last_success_at": self._last_success_at,
                "last_error_at": self._last_error_at,
                "last_error": err.as_dict() if err else None,
                "circuit_open": open_until is not None,
                "circuit_permanently_open": open_until == float("inf"),
                # Healthy = a call has succeeded and nothing has failed since.
                "healthy": self._last_success_at is not None and err is None,
            }

    def reset_health(self) -> None:
        with self._lock:
            self._last_error = None
            self._last_error_at = None
            self._consecutive_failures = 0
            self._circuit_open_until = None
            self._logged_error_kind = None

    # --- API ----------------------------------------------------------
    def _call(self, prompt: str) -> str:
        problem = describe_key_problem(self.api_key)
        if problem:
            raise GroqError("config", problem, hint="set a valid key in Settings → Intelligence")
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        data = self._transport(GROQ_URL, self._headers(), body)
        return data["choices"][0]["message"]["content"]

    def match(self, sentence: str, context: list[str] | None = None) -> list[dict]:
        blocked = self._circuit_blocked()
        if blocked is not None:
            logger.debug("skipping Groq (circuit open: %s)", blocked.message)
            return []

        prompt = PROMPT_TEMPLATE.format(
            context="\n".join(context or []) or "(none)", sentence=sentence
        )
        try:
            text = self._call(prompt)
        except BaseException as exc:  # noqa: BLE001 - Stage 3 must never crash the pipeline
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            self._record_failure(_classify(exc))
            return []

        try:
            results = _hydrate(_parse_refs(text), self.stage)
        except Exception as exc:  # noqa: BLE001 - hydration touches the DB
            self._record_failure(_classify(exc))
            return []
        self._record_success()
        return results

    def verify(self) -> dict:
        """Real connectivity check: does the key work AND is the model available?

        Also updates the health state, so a manual test surfaces in /status.
        """
        problem = describe_key_problem(self.api_key)
        if problem:
            err = GroqError("config", problem, hint="set a valid key in Settings → Intelligence")
            self._record_failure(err)
            return {"ok": False, "model": self.model, "error": err.message, **err.as_dict()}

        try:
            text = self._call("Reply with the single word: ok")
        except BaseException as exc:  # noqa: BLE001
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            err = _classify(exc)
            self._record_failure(err)
            return {"ok": False, "model": self.model, "error": err.message, **err.as_dict()}

        self._record_success()
        return {"ok": True, "model": self.model, "sample": text[:80]}

    # Back-compat alias — the /api/groq/test endpoint and existing tests use this.
    def test_connection(self) -> dict:
        return self.verify()

    def available_models(self) -> list[str]:
        """List model ids the account can actually use (best-effort)."""
        try:
            data = self._transport(GROQ_MODELS_URL, self._headers(), None)
        except BaseException as exc:  # noqa: BLE001
            if isinstance(exc, (KeyboardInterrupt, SystemExit)):
                raise
            logger.debug("could not list Groq models: %s", _classify(exc).message)
            return []
        entries = data.get("data") if isinstance(data, dict) else None
        return [m["id"] for m in entries or [] if isinstance(m, dict) and "id" in m]
