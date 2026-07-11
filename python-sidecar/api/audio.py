"""Audio pipeline endpoints (SS-008 device enum/selection; extended by
SS-009 capture, SS-010 VAD, SS-012 worship detection)."""

from __future__ import annotations

from typing import Optional

from engine.audio import devices, vad
from engine.audio.capture import capture_manager
from engine.audio.devices import AudioBackendError
from engine.audio.state import audio_state
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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


@router.post("/start-capture")
async def start_capture() -> dict:
    """Begin capturing PCM audio from the selected device and streaming it."""
    try:
        await capture_manager.start()
    except AudioBackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # PortAudio / permission errors
        raise HTTPException(
            status_code=500, detail=f"could not start capture: {exc}"
        ) from exc
    return {
        "capturing": True,
        "device_index": audio_state.device_index,
        "sample_rate": audio_state.sample_rate,
        "channels": audio_state.channels,
    }


@router.post("/stop-capture")
async def stop_capture() -> dict:
    await capture_manager.stop()
    return {"capturing": False}


class VadSensitivityRequest(BaseModel):
    sensitivity: float = Field(..., ge=0.0, le=1.0)


@router.post("/vad-sensitivity")
def set_vad_sensitivity(req: VadSensitivityRequest) -> dict:
    """Set VAD sensitivity (0.0 = strict, 1.0 = very sensitive)."""
    vad.set_sensitivity(req.sensitivity)
    audio_state.vad_sensitivity = req.sensitivity
    return {
        "sensitivity": req.sensitivity,
        "threshold": round(vad.get_detector().threshold, 4),
    }
