"""Unit/church selector + multi-unit profiles (SS-046)."""

from __future__ import annotations

from engine.config.store import get_store
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/units", tags=["units"])


class UnitUpsert(BaseModel):
    id: str
    name: str


@router.get("")
def list_units() -> dict:
    store = get_store()
    return {"units": store.list_units(), "active": store.active_unit()}


@router.post("")
def upsert_unit(req: UnitUpsert) -> dict:
    return get_store().upsert_unit(req.id, req.name)


@router.post("/{unit_id}/activate")
def activate_unit(unit_id: str) -> dict:
    try:
        return get_store().set_active_unit(unit_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
