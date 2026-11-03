"""Dev-only live-feed test harness endpoints (SS-072).

Mounted only when SERMONSYNC_DEV_FEED=1. Streams a local file or a URL
(YouTube via yt-dlp) through the exact live capture pipeline in real time and
records the run for scoring (see engine/eval/).
"""

from __future__ import annotations

from typing import Any, Optional

from engine.eval.feed import FeedBusyError, FeedNotRunningError, test_feed
from fastapi import APIRouter, HTTPException
from pydantic import AliasChoices, BaseModel, Field

router = APIRouter(prefix="/api/audio/test-feed", tags=["dev"])


class FeedRequest(BaseModel):
    source: str = Field(..., min_length=1, description="Local path or http(s) URL")
    start: Optional[float] = Field(default=0.0, ge=0)
    duration: Optional[float] = Field(default=None, gt=0)
    speed: Optional[float] = Field(default=1.0, gt=0, le=16)
    # Play the audio out loud while it feeds (real time only).
    monitor: bool = False
    # Device rate to emulate (48 kHz is a typical built-in mic).
    sample_rate: int = Field(default=48000, ge=8000, le=192000)
    label: Optional[str] = None
    # {"streaming.silence_flush_seconds": 0.6, ...} — restored after the run.
    overrides: dict[str, Any] = Field(default_factory=dict)
    score: bool = True
    # The source's uploaded captions are known to be human-written.
    captions_human: bool = False


@router.post("")
async def post_test_feed(req: FeedRequest) -> dict:
    try:
        return await test_feed.start(
            req.source,
            start=req.start or 0.0,
            duration=req.duration,
            speed=req.speed or 1.0,
            monitor=req.monitor,
            sample_rate=req.sample_rate,
            label=req.label,
            overrides=req.overrides,
            score=req.score,
            captions_human=req.captions_human,
        )
    except FeedBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class PrepareRequest(BaseModel):
    source: str = Field(..., min_length=1, description="Local path or http(s) URL")


class SeekRequest(BaseModel):
    # `position_seconds` is the field's original name (SS-072); both are accepted.
    position: float = Field(
        ...,
        ge=0,
        description="Seek to this position in seconds",
        validation_alias=AliasChoices("position", "position_seconds"),
    )


@router.post("/prepare")
async def post_test_feed_prepare(req: PrepareRequest) -> dict:
    """Resolve a source without playing it: duration, title, caption cues and
    the references spoken in the captions (for the seek bar)."""
    try:
        return await test_feed.prepare(req.source)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # yt-dlp / ffprobe failures
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/seek")
async def post_test_feed_seek(req: SeekRequest) -> dict:
    try:
        return await test_feed.seek(req.position)
    except FeedNotRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/stop")
async def post_test_feed_stop() -> dict:
    return await test_feed.stop()


@router.get("")
def get_test_feed_status() -> dict:
    return test_feed.status()
