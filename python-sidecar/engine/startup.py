"""Sidecar pipeline startup and shutdown, in the order the lifespan depends on."""

import asyncio
import logging

from engine.audio.capture import capture_manager
from engine.monitoring import status_emitter
from engine.transcription.streaming import streaming_transcriber

logger = logging.getLogger("sermonsync.sidecar")


async def start_pipeline() -> "asyncio.Task":
    # Close sessions left by an interrupted run before the sidecar reports ready.
    from engine.session.manager import get_manager

    get_manager()

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

    # Interim-transcription mode persisted from Settings (SS-067 groundwork).
    from api.transcription import apply_persisted_partials

    apply_persisted_partials()

    # Route VAD-passed speech chunks into the streaming transcriber.
    capture_manager.speech_sink = streaming_transcriber.feed
    await streaming_transcriber.start()
    # SS-050: apply any persisted Groq cloud-fallback config to Stage 3.
    from engine.matching.llm_matcher import apply_persisted_groq

    apply_persisted_groq()
    status_task = asyncio.create_task(status_emitter())
    return status_task


async def stop_pipeline(status_task: "asyncio.Task") -> None:
    from api.camera import camera_manager

    from engine.session.manager import get_manager

    try:
        get_manager().end()
    except Exception:
        logger.exception("failed to end session during sidecar shutdown")
    status_task.cancel()
    from engine.eval.feed import test_feed

    await test_feed.stop()
    await streaming_transcriber.stop()
    await capture_manager.stop()
    await camera_manager.stop_all()
