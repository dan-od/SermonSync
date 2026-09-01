"""Transcription engine info/control endpoints (SS-013)."""

from __future__ import annotations

from engine.transcription import whisper_engine
from engine.transcription.streaming import streaming_transcriber
from fastapi import APIRouter

router = APIRouter(prefix="/api/transcription", tags=["transcription"])


@router.get("/engine")
def engine_info() -> dict:
    """Report the transcription engine's configured + loaded state.

    Does NOT load the model. It used to call get_engine(), so merely polling
    this endpoint would download gigabytes of weights on a cold sidecar.
    """
    status = whisper_engine.engine_status()
    return {
        # `model` stays the loaded model when there is one, falling back to the
        # configured name, so existing callers keep working.
        "model": status["loaded_model"] or status["configured_model"],
        "configured_model": status["configured_model"],
        "loaded_model": status["loaded_model"],
        "loaded": status["loaded"],
        "degraded": status["degraded"],
        "model_source": status["model_source"],
        "device": status["device"],
        "compute_type": status["compute_type"],
        "is_mock": status["is_mock"],
        "streaming": streaming_transcriber._running,
        "max_chunk_seconds": streaming_transcriber.max_chunk_seconds,
        "silence_flush_seconds": streaming_transcriber.silence_flush_seconds,
    }
