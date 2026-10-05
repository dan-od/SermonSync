"""SermonSync AI sidecar — FastAPI app.

Launched by the Tauri app as a sidecar process. Hosts the real-time audio →
transcription → scripture-matching pipeline: audio capture/VAD/worship
detection, Whisper streaming transcription, and the Bible database API.
"""

import asyncio
import logging
import os
import re
import time
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from api.archive import router as archive_router
from api.audio import router as audio_router
from api.bible import router as bible_router
from api.camera import camera_manager
from api.camera import router as camera_router
from api.engine import router as engine_router
from api.groq import router as groq_router
from api.pipeline import router as pipeline_router
from api.presets import router as presets_router
from api.session import router as session_router
from api.settings import router as settings_router
from api.system import router as system_router
from api.transcription import router as transcription_router
from api.units import router as units_router
from engine.audio.capture import capture_manager
from engine.monitoring import status_emitter
from engine.transcription.streaming import streaming_transcriber
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from ws_hub import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sermonsync.sidecar")

ENGINE = "sermonsync-ai"
VERSION = "0.1.0"
PIPELINE_STAGES = 4

# Backs /api/logs, which the LaunchScreen polls to know when the sidecar has
# finished booting. Without this the launch screen never proceeds (SS-boot).
_LOG_BUFFER_MAXLEN = 200
_log_buffer: deque[dict] = deque(maxlen=_LOG_BUFFER_MAXLEN)
_pipeline_ready = False


class _BufferingLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        _log_buffer.append(
            {
                "time": time.strftime("%H:%M:%S", time.localtime(record.created)),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
        )


logging.getLogger().addHandler(_BufferingLogHandler())


@asynccontextmanager
async def lifespan(app: FastAPI):
    # State what the transcription engine will load, before anything else can
    # obscure it (SS-065). One greppable line; the model itself loads lazily.
    from engine.transcription.whisper_engine import log_engine_configuration

    log_engine_configuration()

    # Restore the detector before capture can start. The renderer also sends
    # its locally persisted value when it connects, keeping both processes in sync.
    from engine.audio import vad
    from engine.audio.state import audio_state
    from engine.config.store import get_store

    saved_vad_sensitivity = float(get_store().get_setting("vad_sensitivity", 0.5))
    saved_vad_sensitivity = max(0.0, min(1.0, saved_vad_sensitivity))
    vad.set_sensitivity(saved_vad_sensitivity)
    audio_state.vad_sensitivity = saved_vad_sensitivity

    # Route VAD-passed speech chunks into the streaming transcriber.
    capture_manager.speech_sink = streaming_transcriber.feed
    await streaming_transcriber.start()
    # SS-050: apply any persisted Groq cloud-fallback config to Stage 3.
    from engine.matching.llm_matcher import apply_persisted_groq

    apply_persisted_groq()
    status_task = asyncio.create_task(status_emitter())
    global _pipeline_ready
    _pipeline_ready = True
    logger.info("sidecar pipeline ready")
    yield
    status_task.cancel()
    await streaming_transcriber.stop()
    await capture_manager.stop()
    await camera_manager.stop_all()


app = FastAPI(title="SermonSync AI Sidecar", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(bible_router)
app.include_router(engine_router)
app.include_router(audio_router)
app.include_router(camera_router)
app.include_router(transcription_router)
app.include_router(system_router)
app.include_router(pipeline_router)
app.include_router(session_router)
app.include_router(archive_router)
app.include_router(presets_router)
app.include_router(units_router)
app.include_router(settings_router)
app.include_router(groq_router)


@app.get("/health")
async def health() -> dict:
    """Liveness probe the Tauri backend hits to confirm the sidecar is up."""
    return {"status": "ok"}


@app.get("/api/template-video/{filename}")
async def template_video(filename: str) -> FileResponse:
    """Stream a prepared template background with HTTP byte ranges."""
    if not re.fullmatch(r"[0-9a-f]{16}\.mp4", filename):
        raise HTTPException(status_code=404)
    cache_dir = Path(os.environ.get(
        "SERMONSYNC_VIDEO_CACHE_DIR",
        Path.home() / ".config" / "com.sermonsync.app" / "video-cache",
    ))
    video = cache_dir / filename
    if not video.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(video, media_type="video/mp4")


@app.get("/api/media-video/{asset_id}/playback.mp4")
async def managed_video(asset_id: str) -> FileResponse:
    """Serve only committed managed videos, including HTTP range requests."""
    if not re.fullmatch(r"[0-9a-f]{64}-sermonsync-playback-v1", asset_id):
        raise HTTPException(status_code=404)
    directory = Path(os.environ.get(
        "SERMONSYNC_MANAGED_VIDEO_DIR",
        Path.home() / ".local" / "share" / "com.sermonsync.app" / "media" / "videos" / "assets",
    ))
    video = directory / asset_id / "playback.mp4"
    if not video.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(video, media_type="video/mp4")


@app.get("/api/media-video/{asset_id}/poster.jpg")
async def managed_video_poster(asset_id: str) -> FileResponse:
    """Serve the generated snapshot through the same loopback origin as playback."""
    if not re.fullmatch(r"[0-9a-f]{64}-sermonsync-playback-v1", asset_id):
        raise HTTPException(status_code=404)
    directory = Path(os.environ.get(
        "SERMONSYNC_MANAGED_VIDEO_DIR",
        Path.home() / ".local" / "share" / "com.sermonsync.app" / "media" / "videos" / "assets",
    ))
    poster = directory / asset_id / "poster.jpg"
    if not poster.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(poster, media_type="image/jpeg")


@app.get("/api/status")
async def status() -> dict:
    """Engine metadata for the frontend SYS/engine-version displays."""
    return {
        "engine": ENGINE,
        "version": VERSION,
        "pipeline_stages": PIPELINE_STAGES,
    }


@app.get("/api/logs")
async def logs() -> dict:
    """Boot log buffer + readiness flag polled by the LaunchScreen."""
    return {
        "logs": list(_log_buffer),
        "ready": _pipeline_ready,
    }


@app.websocket("/ws/audio")
async def ws_audio(websocket: WebSocket) -> None:
    """Audio ingest channel.

    Accepts the connection, acks it, and registers the client with the shared
    broadcast hub so engine components can push events (audio levels, VAD state,
    transcription, suggestions, system status) to it.
    """
    await manager.connect(websocket)
    await websocket.send_json({"type": "ack", "message": "connected"})
    try:
        while True:
            message = await websocket.receive_text()
            logger.info("audio ws received: %s", message)
    except WebSocketDisconnect:
        await manager.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
