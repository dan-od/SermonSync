"""Engine status endpoint (SS-065).

Single authoritative answer to "what is actually running?" — engine version
plus the transcription model that is *configured* and the one that actually
*loaded*. Those two diverge whenever the fallback chain fires, and that
divergence is exactly what made SS-013 look shipped while `tiny` was running.
"""

from __future__ import annotations

from engine.eval.feed import dev_feed_enabled, test_feed
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
        # SS-072: the UI shows the test-feed controls only when this is true.
        "dev_feed": dev_feed_enabled(),
        "test_feed": test_feed.status() if dev_feed_enabled() else None,
    }
