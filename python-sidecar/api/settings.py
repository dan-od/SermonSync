"""Persisted settings key-value store (backend for SS-051 persistence).

Lets the frontend Settings panel persist preferences across restarts instead of
holding them in in-memory React state only.
"""

from __future__ import annotations

from typing import Any

from engine.config.store import get_store
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingUpdate(BaseModel):
    key: str
    value: Any


@router.get("")
def get_settings() -> dict:
    return {"settings": get_store().all_settings()}


@router.put("")
def put_setting(req: SettingUpdate) -> dict:
    get_store().set_setting(req.key, req.value)
    return {"key": req.key, "value": req.value}
