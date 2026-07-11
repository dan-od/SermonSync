"""Raw PCM audio capture and streaming (SS-009).

Captures 16 kHz mono float32 audio from the selected input device, converts to
16-bit PCM, and streams chunks over the /ws/audio WebSocket as binary frames.
RMS/peak levels are emitted as JSON for the frontend waveform visualizer.

The sounddevice InputStream callback runs in a PortAudio thread; results are
handed back to the asyncio loop via run_coroutine_threadsafe.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math

from ws_hub import manager

from . import vad, worship_detector
from .devices import AudioBackendError, backend_available
from .state import audio_state

logger = logging.getLogger("sermonsync.audio.capture")

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

try:
    import sounddevice as _sd
except (OSError, ImportError):  # pragma: no cover
    _sd = None


# ---------------------------------------------------------------------------
# Pure helpers (unit-tested without hardware)
# ---------------------------------------------------------------------------

def compute_levels(samples) -> tuple[float, float]:
    """Return (rms, peak) for a float32 sample buffer in [-1, 1]."""
    if np is not None:
        arr = np.asarray(samples, dtype="float32").ravel()
        if arr.size == 0:
            return 0.0, 0.0
        rms = float(np.sqrt(np.mean(np.square(arr))))
        peak = float(np.max(np.abs(arr)))
        return rms, peak
    # numpy-free fallback
    flat = [float(x) for x in samples]
    if not flat:
        return 0.0, 0.0
    rms = math.sqrt(sum(x * x for x in flat) / len(flat))
    peak = max(abs(x) for x in flat)
    return rms, peak


def float_to_pcm16(samples) -> bytes:
    """Convert float32 samples in [-1, 1] to little-endian 16-bit PCM bytes."""
    if np is None:  # pragma: no cover
        raise RuntimeError("numpy required for PCM conversion")
    arr = np.asarray(samples, dtype="float32").ravel()
    clipped = np.clip(arr, -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


# ---------------------------------------------------------------------------
# Capture manager
# ---------------------------------------------------------------------------

class CaptureManager:
    def __init__(self) -> None:
        self._stream = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._chunk_counter = 0
        # Emit an audio_level JSON roughly every ~100 ms (every 3rd 30 ms chunk).
        self._level_every = 3
        self._last_is_speech = False
        self._last_acoustic_state = worship_detector.SILENCE
        # Emit a worship/scene decision roughly every ~0.5 s (every 16th frame).
        self._scene_every = 16
        # Optional sink for VAD-passed speech chunks (set by transcription, SS-013).
        # Signature: sink(pcm_bytes: bytes) -> None
        self.speech_sink = None

    @property
    def is_capturing(self) -> bool:
        return self._stream is not None

    async def start(self) -> None:
        if self.is_capturing:
            return
        if not backend_available() or _sd is None:
            raise AudioBackendError("audio backend unavailable")
        if audio_state.device_index is None:
            raise ValueError("no input device selected")

        self._loop = asyncio.get_running_loop()
        self._chunk_counter = 0
        try:
            self._stream = _sd.InputStream(
                samplerate=audio_state.sample_rate,
                channels=audio_state.channels,
                dtype="float32",
                blocksize=audio_state.chunk_samples,
                device=audio_state.device_index,
                callback=self._on_audio,
            )
            self._stream.start()
        except Exception as exc:  # PortAudioError, permission denied, etc.
            self._stream = None
            logger.error("failed to start capture: %s", exc)
            raise
        audio_state.is_capturing = True
        logger.info("capture started on device %s", audio_state.device_index)

    async def stop(self) -> None:
        audio_state.is_capturing = False
        stream, self._stream = self._stream, None
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except Exception as exc:  # pragma: no cover
                logger.warning("error stopping stream: %s", exc)
        logger.info("capture stopped")

    def _on_audio(self, indata, frames, time_info, status) -> None:
        """PortAudio callback (runs in a separate thread)."""
        if status:
            # e.g. input overflow, or device removed mid-capture.
            logger.warning("audio callback status: %s", status)
            if getattr(status, "input_error", False) or "error" in str(status).lower():
                self._schedule(self._handle_device_error(str(status)))
                return
        try:
            samples = indata.copy()
            rms, peak = compute_levels(samples)
            pcm = float_to_pcm16(samples)
        except Exception as exc:  # pragma: no cover
            logger.error("audio processing error: %s", exc)
            return

        audio_state.last_rms = rms
        audio_state.last_peak = peak

        # VAD gate (SS-010): classify the chunk; only speech reaches transcription.
        is_speech, vad_conf = vad.get_detector().process_rms(rms)

        # Worship/scene detection (SS-012): reduce/pause transcription on music.
        flatness = worship_detector.spectral_flatness(samples)
        scene, scene_conf = worship_detector.get_detector().update(rms, flatness)
        audio_state.acoustic_state = scene

        # Forward to transcription only when it's speech AND not worship/music.
        forward = is_speech and scene != worship_detector.WORSHIP
        if forward and self.speech_sink is not None:
            try:
                self.speech_sink(pcm)
            except Exception as exc:  # pragma: no cover
                logger.error("speech sink error: %s", exc)

        self._chunk_counter += 1
        emit_level = self._chunk_counter % self._level_every == 0
        vad_changed = is_speech != self._last_is_speech
        self._last_is_speech = is_speech

        scene_changed = scene != self._last_acoustic_state
        emit_scene = scene_changed or (self._chunk_counter % self._scene_every == 0)
        self._last_acoustic_state = scene

        self._schedule(
            self._emit(
                pcm, rms, peak, emit_level, is_speech, vad_conf, vad_changed,
                scene, scene_conf, emit_scene,
            )
        )

    def _schedule(self, coro) -> None:
        if self._loop is None:
            return
        with contextlib.suppress(RuntimeError):  # loop closed
            asyncio.run_coroutine_threadsafe(coro, self._loop)

    async def _emit(
        self,
        pcm: bytes,
        rms: float,
        peak: float,
        emit_level: bool,
        is_speech: bool,
        vad_conf: float,
        vad_changed: bool,
        scene: str,
        scene_conf: float,
        emit_scene: bool,
    ) -> None:
        await manager.broadcast_bytes(pcm)
        if emit_level:
            await manager.broadcast_json(
                {"type": "audio_level", "rms": round(rms, 4), "peak": round(peak, 4)}
            )
        # Emit VAD state on transitions (and periodically while active).
        if vad_changed or (emit_level and is_speech):
            await manager.broadcast_json(
                {"type": "vad_state", "is_speech": is_speech, "confidence": vad_conf}
            )
        # Emit worship/scene state on transitions and periodically (SS-012).
        if emit_scene:
            await manager.broadcast_json(
                {"type": "state_change", "state": scene, "confidence": scene_conf}
            )

    async def _handle_device_error(self, detail: str) -> None:
        await manager.broadcast_json(
            {"type": "audio_error", "error": "device_error", "detail": detail}
        )
        await self.stop()


capture_manager = CaptureManager()
