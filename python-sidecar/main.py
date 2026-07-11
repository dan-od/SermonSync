"""SermonSync AI sidecar — FastAPI skeleton.

Launched by the Tauri app as a sidecar process. This is the backbone the
real-time audio → transcription → scripture-matching pipeline will hang off.
No AI logic yet — just the health/status/websocket skeleton.
"""

import logging

import uvicorn
from api.audio import router as audio_router
from api.bible import router as bible_router
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from ws_hub import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sermonsync.sidecar")

ENGINE = "sermonsync-ai"
VERSION = "0.1.0"
PIPELINE_STAGES = 4

app = FastAPI(title="SermonSync AI Sidecar", version=VERSION)
app.include_router(bible_router)
app.include_router(audio_router)


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
