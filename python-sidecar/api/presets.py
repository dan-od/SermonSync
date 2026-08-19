"""Fast Scripture preset CRUD + persistence (SS-043)."""

from __future__ import annotations

from typing import Optional

from engine.config.store import get_store
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/presets", tags=["presets"])


class PresetCreate(BaseModel):
    reference: str
    unit_id: Optional[str] = None
    label: Optional[str] = None


class PresetUpdate(BaseModel):
    reference: Optional[str] = None
    label: Optional[str] = None
    position: Optional[int] = None


class ReorderRequest(BaseModel):
    ordered_ids: list[int]


@router.get("")
def list_presets(unit_id: Optional[str] = None) -> dict:
    presets = get_store().list_presets(unit_id=unit_id)
    return {"count": len(presets), "presets": presets}


@router.post("")
def create_preset(req: PresetCreate) -> dict:
    return get_store().add_preset(req.reference, unit_id=req.unit_id, label=req.label)


@router.patch("/{preset_id}")
def update_preset(preset_id: int, req: PresetUpdate) -> dict:
    try:
        return get_store().update_preset(
            preset_id, reference=req.reference, label=req.label, position=req.position
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{preset_id}")
def delete_preset(preset_id: int) -> dict:
    if not get_store().delete_preset(preset_id):
        raise HTTPException(status_code=404, detail=f"unknown preset {preset_id}")
    return {"deleted": True, "id": preset_id}


@router.post("/reorder")
def reorder_presets(req: ReorderRequest) -> dict:
    get_store().reorder_presets(req.ordered_ids)
    return {"reordered": True, "count": len(req.ordered_ids)}
