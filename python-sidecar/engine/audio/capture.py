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
        self._chunk_counter += 1
        emit_level = self._chunk_counter % self._level_every == 0
        self._schedule(self._emit(pcm, rms, peak, emit_level))

    def _schedule(self, coro) -> None:
        if self._loop is None:
            return
        with contextlib.suppress(RuntimeError):  # loop closed
            asyncio.run_coroutine_threadsafe(coro, self._loop)

    async def _emit(self, pcm: bytes, rms: float, peak: float, emit_level: bool) -> None:
        await manager.broadcast_bytes(pcm)
        if emit_level:
            await manager.broadcast_json(
                {"type": "audio_level", "rms": round(rms, 4), "peak": round(peak, 4)}
            )

    async def _handle_device_error(self, detail: str) -> None:
        await manager.broadcast_json(
            {"type": "audio_error", "error": "device_error", "detail": detail}
        )
        await self.stop()


capture_manager = CaptureManager()
