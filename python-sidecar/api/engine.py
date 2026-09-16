"""Engine status endpoint (SS-065).

Single authoritative answer to "what is actually running?" — engine version
plus the transcription model that is *configured* and the one that actually
*loaded*. Those two diverge whenever the fallback chain fires, and that
divergence is exactly what made SS-013 look shipped while `tiny` was running.
"""

from __future__ import annotations

from engine.transcription import whisper_engine
from engine.transcription.streaming import streaming_transcriber
from engine.version import ENGINE_NAME, ENGINE_VERSION
from fastapi import APIRouter

router = APIRouter(prefix="/api/engine", tags=["engine"])


@router.get("/status")
def engine_status() -> dict:
    """Report engine version + transcription model state.

    Never forces a model load — a status probe must not trigger a
    multi-gigabyte download.
    """
    status = whisper_engine.engine_status()
    return {
        "engine": ENGINE_NAME,
        "version": ENGINE_VERSION,
        "transcription": {
            "backend": "faster-whisper",
            **status,
            "streaming": streaming_transcriber._running,
        },
    }
