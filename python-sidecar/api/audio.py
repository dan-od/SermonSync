"""Audio pipeline endpoints (SS-008 device enum/selection; extended by
SS-009 capture, SS-010 VAD, SS-012 worship detection)."""

from __future__ import annotations

from typing import Optional

from engine.audio import devices
from engine.audio.state import audio_state
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/audio", tags=["audio"])


class SelectDeviceRequest(BaseModel):
    # NB: Pydantic evaluates these at runtime; use typing.Optional so the model
    # works on Python 3.9 (PEP 604 `int | None` isn't runtime-evaluable there).
    index: Optional[int] = None
    name: Optional[str] = None


@router.get("/devices")
def get_devices(refresh: bool = False) -> dict:
    """List available input devices with metadata."""
    if not devices.backend_available():
        raise HTTPException(status_code=503, detail="audio backend unavailable")
    try:
        found = devices.list_input_devices(refresh=refresh)
    except devices.AudioBackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "count": len(found),
        "selected_index": audio_state.device_index,
        "devices": found,
    }


@router.post("/select-device")
def select_device(req: SelectDeviceRequest) -> dict:
    """Set the active input device by index or name."""
    if not devices.backend_available():
        raise HTTPException(status_code=503, detail="audio backend unavailable")
    try:
        chosen = devices.select_device(index=req.index, name=req.name)
    except devices.AudioBackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"selected": chosen}
