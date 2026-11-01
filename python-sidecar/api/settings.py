"""Persisted settings key-value store (backend for SS-051 persistence).

Lets the frontend Settings panel persist preferences across restarts instead of
holding them in in-memory React state only.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from engine.config.store import get_store
from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger("sermonsync.settings")

router = APIRouter(prefix="/api/settings", tags=["settings"])

_WHISPER_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "whisper_config.json")


def _sync_whisper_config(model: str) -> None:
    """Write the model name to a JSON file Tauri reads before spawning."""
    try:
        os.makedirs(os.path.dirname(_WHISPER_CONFIG_PATH), exist_ok=True)
        with open(_WHISPER_CONFIG_PATH, "w") as f:
            json.dump({"model": model}, f)
    except Exception as exc:
        logger.warning("failed to write whisper_config.json: %s", exc)


class SettingUpdate(BaseModel):
    key: str
    value: Any


@router.get("")
def get_settings() -> dict:
    return {"settings": get_store().all_settings()}


@router.put("")
def put_setting(req: SettingUpdate) -> dict:
    get_store().set_setting(req.key, req.value)
    if req.key == "whisper.model":
        _sync_whisper_config(req.value)
    return {"key": req.key, "value": req.value}
