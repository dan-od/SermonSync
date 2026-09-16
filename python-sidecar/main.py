"""SermonSync AI sidecar — FastAPI app.

Launched by the Tauri app as a sidecar process. Hosts the real-time audio →
transcription → scripture-matching pipeline: audio capture/VAD/worship
detection, Whisper streaming transcription, and the Bible database API.
"""

import asyncio
import logging
import signal
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime

import uvicorn
from api.archive import router as archive_router
from api.audio import router as audio_router
from api.bible import router as bible_router
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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from ws_hub import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sermonsync.sidecar")


class LaunchLogHandler(logging.Handler):
    """Keep the recent real sidecar logs available to the launch screen."""

    def __init__(self) -> None:
        super().__init__()
        self.entries: deque[dict[str, str]] = deque(maxlen=80)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.entries.append(
                {
                    "time": datetime.fromtimestamp(record.created).strftime("%H:%M:%S.%f")[:-3],
                    "level": record.levelname,
                    "logger": record.name,
                    "message": record.getMessage(),
                }
            )
        except Exception:
            # Logging must never be able to abort sidecar startup.
            self.handleError(record)


launch_log_handler = LaunchLogHandler()
launch_log_handler.setFormatter(logging.Formatter("%(asctime)s"))
logging.getLogger().addHandler(launch_log_handler)

# Set once in lifespan startup. Deliberately not derived from the bounded
# log buffer above — on a long-running session the "pipeline ready" line
# scrolls out of that deque, which would flip /api/logs back to ready=false
# forever and hang the launch screen even though the sidecar is fine.
_pipeline_ready = False

ENGINE = "sermonsync-ai"
VERSION = "0.1.0"
PIPELINE_STAGES = 4


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline_ready
    # Route VAD-passed speech chunks into the streaming transcriber.
    capture_manager.speech_sink = streaming_transcriber.feed
    await streaming_transcriber.start()
    # SS-050: apply any persisted Groq cloud-fallback config to Stage 3.
    from engine.matching.llm_matcher import apply_persisted_groq

    apply_persisted_groq()
    status_task = asyncio.create_task(status_emitter())
    logger.info("sidecar pipeline ready")
    _pipeline_ready = True
    yield
    _pipeline_ready = False
    status_task.cancel()
    await streaming_transcriber.stop()
    await capture_manager.stop()


app = FastAPI(title="SermonSync AI Sidecar", version=VERSION, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(bible_router)
app.include_router(audio_router)
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
    """Return the current real sidecar log buffer for the launch screen."""
    entries = list(launch_log_handler.entries)
    return {"logs": entries, "ready": _pipeline_ready}


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
    config = uvicorn.Config(app, host="127.0.0.1", port=8000, log_level="info")
    server = uvicorn.Server(config)

    # When the Tauri parent shuts down it SIGTERMs/SIGKILLs this process.
    # Handle both explicitly so uvicorn runs its lifespan cleanup (stops the
    # audio capture and streaming transcriber) instead of dying mid-stream and
    # lingering as an orphan on port 8000.
    def _graceful_shutdown(signum, _frame):  # noqa: ANN001, ANN202
        logger.info("received signal %s — shutting down sidecar", signum)
        server.should_exit = True

    signal.signal(signal.SIGTERM, _graceful_shutdown)
    signal.signal(signal.SIGINT, _graceful_shutdown)

    server.run()
