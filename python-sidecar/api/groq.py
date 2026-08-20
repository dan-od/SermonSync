"""Groq cloud LLM fallback config + connection test (SS-050).

Makes the Settings "Test Connection" real and persists the key/model/enabled
flag so Stage 3 can route to Groq. Key is stored in the local app.db (plaintext
— acceptable for a local desktop app; noted for future secure storage).
"""

from __future__ import annotations

from typing import Optional

from engine.config.store import get_store
from engine.matching import llm_matcher
from engine.matching.groq_matcher import DEFAULT_GROQ_MODEL, GroqMatcher
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/groq", tags=["groq"])


class GroqConfig(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None
    enabled: bool = True


class GroqTest(BaseModel):
    api_key: Optional[str] = None
    model: Optional[str] = None


@router.get("/status")
def groq_status() -> dict:
    """Report Groq config WITHOUT exposing the stored key."""
    store = get_store()
    return {
        "enabled": bool(store.get_setting("groq_enabled", False)),
        "model": store.get_setting("groq_model", DEFAULT_GROQ_MODEL),
        "linked": bool(store.get_setting("groq_enabled", False))
        and bool(store.get_setting("groq_api_key")),
    }


@router.post("/config")
def set_groq_config(cfg: GroqConfig) -> dict:
    """Persist Groq config and (re)route Stage 3 accordingly."""
    store = get_store()
    if cfg.api_key is not None:
        store.set_setting("groq_api_key", cfg.api_key)
    if cfg.model is not None:
        store.set_setting("groq_model", cfg.model)
    store.set_setting("groq_enabled", cfg.enabled)

    api_key = store.get_setting("groq_api_key")
    model = store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
    llm_matcher.configure_groq(cfg.enabled, api_key, model)
    return {"enabled": cfg.enabled, "model": model, "linked": bool(cfg.enabled and api_key)}


@router.post("/test")
def test_groq(req: GroqTest) -> dict:
    """Live connection test — uses the supplied key or the stored one."""
    store = get_store()
    api_key = req.api_key or store.get_setting("groq_api_key")
    model = req.model or store.get_setting("groq_model", DEFAULT_GROQ_MODEL)
    if not api_key:
        raise HTTPException(status_code=400, detail="no Groq API key provided or stored")
    return GroqMatcher(api_key=api_key, model=model).test_connection()
