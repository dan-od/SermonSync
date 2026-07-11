"""Transcription engine info/control endpoints (SS-013)."""

from __future__ import annotations

from engine.transcription import whisper_engine
from engine.transcription.streaming import streaming_transcriber
from fastapi import APIRouter

router = APIRouter(prefix="/api/transcription", tags=["transcription"])


@router.get("/engine")
def engine_info() -> dict:
    """Report the active engine (loads it lazily on first call)."""
    engine = whisper_engine.get_engine()
    return {
        "model": getattr(engine, "model_size", "unknown"),
        "device": getattr(engine, "device", "unknown"),
        "is_mock": getattr(engine, "is_mock", True),
        "streaming": streaming_transcriber._running,
        "min_infer_seconds": streaming_transcriber.min_infer_seconds,
    }
