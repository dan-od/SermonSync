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
through to Stage 4), and never crashes the pipeline.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from .llm_matcher import PROMPT_TEMPLATE, _hydrate, _parse_refs

logger = logging.getLogger("sermonsync.matching.groq")

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"


def _default_transport(url: str, headers: dict, body: dict, timeout: float = 20.0) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


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

    def _call(self, prompt: str) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }
        data = self._transport(GROQ_URL, headers, body)
        return data["choices"][0]["message"]["content"]

    def match(self, sentence: str, context: list[str] | None = None) -> list[dict]:
        prompt = PROMPT_TEMPLATE.format(
            context="\n".join(context or []) or "(none)", sentence=sentence
        )
        try:
            text = self._call(prompt)
        except (urllib.error.URLError, KeyError, TimeoutError, OSError) as exc:
            logger.warning("Groq call failed, degrading: %s", exc)
            return []
        return _hydrate(_parse_refs(text), self.stage)

    def test_connection(self) -> dict:
        """Minimal call to verify the key/model work. Returns {ok, detail}."""
        try:
            text = self._call("Reply with the single word: ok")
            return {"ok": True, "model": self.model, "sample": text[:80]}
        except urllib.error.HTTPError as exc:  # pragma: no cover - network
            return {"ok": False, "error": f"HTTP {exc.code}: {exc.reason}"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
