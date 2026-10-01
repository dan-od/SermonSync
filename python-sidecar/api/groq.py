"""Groq cloud LLM fallback config + connection test (SS-050).

Makes the Settings "Test Connection" real and persists the key/model/enabled
flag so Stage 3 can route to Groq. Key is stored in the local app.db (plaintext
— acceptable for a local desktop app; noted for future secure storage).

/status reports the *runtime* health of the matcher that is actually serving
Stage 3 — last_error, failure counts, whether the circuit is open — rather than
inferring "linked" from the mere presence of a stored string. A key that is
rejected at request time now shows up as linked:false with the reason attached.
"""

from __future__ import annotations

from typing import Optional

from engine.config.store import get_store
from engine.matching import llm_matcher
from engine.matching.groq_matcher import (
    DEFAULT_GROQ_MODEL,
    GroqMatcher,
    describe_key_problem,
)
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/groq", tags=["groq"])


class GroqConfig(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    enabled: bool = True


class GroqTest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None


def _status_payload() -> dict:
    store = get_store()
    enabled = bool(store.get_setting("groq_enabled", False))
    api_key = store.get_setting("groq_api_key")
    model = store.get_setting("groq_model", DEFAULT_GROQ_MODEL)

    key_problem = describe_key_problem(api_key) if api_key else "no Groq API key stored"
    matcher = llm_matcher.active_groq_matcher()
    health = matcher.health() if matcher else None

    # `linked` means "Stage 3 can actually use Groq right now" — not merely
    # "a key-shaped string is on disk". A hard failure (bad key, blocked client,
    # dead model) flips this false so the UI stops claiming Connected.
    hard_failed = bool(health and health["circuit_permanently_open"])
    linked = enabled and not key_problem and not hard_failed

    if not enabled:
        reason = "Groq fallback is disabled"
    elif key_problem:
        reason = key_problem
    elif health and health["last_error"]:
        err = health["last_error"]
        reason = f"{err['kind']}: {err['message']}"
    elif health and health["last_success_at"]:
        reason = None
    else:
        reason = "configured but not yet exercised — no call made since startup"

    payload = {
        "enabled": enabled,
        "model": model,
        "linked": linked,
        # Stage 3 is currently routed to Groq (vs. local GGUF / mock).
        "active": matcher is not None,
        "key_problem": key_problem,
        "reason": reason,
        "healthy": bool(health and health["healthy"]),
        "last_error": None,
        "last_error_at": None,
        "last_success_at": None,
        "consecutive_failures": 0,
        "calls": 0,
        "failures": 0,
        "circuit_open": False,
    }
    if health:
        payload.update(
            {
                "last_error": health["last_error"],
                "last_error_at": health["last_error_at"],
                "last_success_at": health["last_success_at"],
                "consecutive_failures": health["consecutive_failures"],
                "calls": health["calls"],
                "failures": health["failures"],
                "circuit_open": health["circuit_open"],
            }
        )
    return payload


@router.get("/status")
def groq_status(
    verify: bool = Query(
        False,
        description="Run a real round-trip to Groq before reporting (slow; ~1s).",
    ),
) -> dict:
    """Report Groq config and live health WITHOUT exposing the stored key."""
    if verify:
        store = get_store()
        api_key = store.get_setting("groq_api_key")
        if api_key:
            model = store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
            matcher = llm_matcher.active_groq_matcher()
            if matcher is None or matcher.api_key != api_key or matcher.model != model:
                matcher = GroqMatcher(api_key=api_key, model=model)
            result = matcher.verify()
            return {**_status_payload(), "verification": result}
    return _status_payload()


@router.post("/config")
def set_groq_config(cfg: GroqConfig) -> dict:
    """Persist Groq config and (re)route Stage 3 accordingly."""
    store = get_store()
    if cfg.api_key is not None:
        store.set_setting("groq_api_key", cfg.api_key.strip())
    if cfg.model is not None:
        store.set_setting("groq_model", cfg.model)
    store.set_setting("groq_enabled", cfg.enabled)

    api_key = store.get_setting("groq_api_key")
    model = store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
    llm_matcher.configure_groq(cfg.enabled, api_key, model)
    return _status_payload()


@router.post("/test")
def test_groq(req: GroqTest) -> dict:
    """Live connection test — uses the supplied key or the stored one.

    When testing the stored credentials this reuses the live Stage 3 matcher, so
    the result is recorded in its health state and shows up in /status.
    """
    store = get_store()
    api_key = req.api_key or store.get_setting("groq_api_key")
    model = req.model or store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
    if not api_key:
        raise HTTPException(status_code=400, detail="no Groq API key provided or stored")

    matcher = llm_matcher.active_groq_matcher()
    if matcher is None or matcher.api_key != api_key or matcher.model != model:
        matcher = GroqMatcher(api_key=api_key, model=model)
    return matcher.verify()


@router.get("/models")
def groq_models() -> dict:
    """Model ids the stored key can actually use — confirms the configured model exists."""
    store = get_store()
    api_key = store.get_setting("groq_api_key")
    model = store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
    if not api_key:
        raise HTTPException(status_code=400, detail="no Groq API key stored")
    models = GroqMatcher(api_key=api_key, model=model).available_models()
    return {
        "configured_model": model,
        "available": models,
        "configured_model_available": model in models if models else None,
    }
