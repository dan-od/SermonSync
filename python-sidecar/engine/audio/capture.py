"""Raw PCM audio capture and streaming (SS-009).

Captures float32 audio from the selected input device, converts speech chunks
to 16-bit PCM for transcription, and emits RMS/peak levels as JSON for the
frontend waveform visualizer.

The sounddevice InputStream callback runs in a PortAudio thread; results are
handed back to the asyncio loop via run_coroutine_threadsafe.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import math
import time
from collections import deque

from ws_hub import manager

from ..eval import tap
from . import vad, worship_detector
from .devices import AudioBackendError, backend_available, list_input_devices
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


def resample_to_transcription_rate(samples, source_rate: int, target_rate: int = 16000):
    """Convert device-rate samples to mono at the transcription sample rate."""
    if np is None:  # pragma: no cover
        raise RuntimeError("numpy required for audio resampling")
    arr = np.asarray(samples, dtype="float32")
    arr = np.mean(arr, axis=1) if arr.ndim > 1 else arr.ravel()
    if source_rate == target_rate or arr.size == 0:
        return arr
    target_size = max(1, round(arr.size * target_rate / source_rate))
    source_positions = np.linspace(0, arr.size - 1, num=arr.size)
    target_positions = np.linspace(0, arr.size - 1, num=target_size)
    return np.interp(target_positions, source_positions, arr).astype("float32")


class StreamResampler:
    """Stateful device-rate -> 16 kHz mono resampler for 20 ms frames.

    `resample_to_transcription_rate` treats every frame on its own: it maps
    the frame's last input sample onto its last output sample (a ~0.3 %
    time-warp inside each frame and a phase jump at every boundary, i.e. a
    50 Hz glitch) and has no anti-alias filter, so 8–24 kHz content folds
    into the speech band. This keeps the fractional read position and the
    filter history across frames, low-passes below the target Nyquist with a
    windowed-sinc FIR, then reads at exact positions.
    """

    TAPS = 63

    def __init__(self, source_rate: int, target_rate: int = 16000) -> None:
        self.source_rate = int(source_rate)
        self.target_rate = int(target_rate)
        self.step = self.source_rate / self.target_rate
        self._pos = 0.0  # read position, relative to the current frame start
        self._kernel = None
        self._history = None
        if self.source_rate > self.target_rate:
            cutoff = 0.45 * self.target_rate / self.source_rate  # cycles/sample
            n = np.arange(self.TAPS) - (self.TAPS - 1) / 2
            kernel = 2 * cutoff * np.sinc(2 * cutoff * n) * np.hamming(self.TAPS)
            self._kernel = (kernel / kernel.sum()).astype("float32")
            self._history = np.zeros(self.TAPS - 1, dtype="float32")
        self._prev_last = 0.0

    def process(self, samples):
        arr = np.asarray(samples, dtype="float32")
        arr = np.mean(arr, axis=1) if arr.ndim > 1 else arr.ravel()
        if self.source_rate == self.target_rate or arr.size == 0:
            return arr.astype("float32", copy=False)
        if self._kernel is not None:
            padded = np.concatenate([self._history, arr])
            self._history = padded[-(self.TAPS - 1):]
            # "valid" output is delayed by (TAPS-1)/2 samples; a constant
            # delay, identical for every frame, so it never warps time.
            filtered = np.convolve(padded, self._kernel, mode="valid").astype("float32")
        else:
            filtered = arr
        # Read positions in this frame; index -1 is the previous frame's last
        # sample, so interpolation across the boundary is seamless.
        positions = np.arange(self._pos, filtered.size, self.step)
        extended = np.concatenate([[self._prev_last], filtered]).astype("float32")
        out = np.interp(positions + 1.0, np.arange(extended.size), extended)
        if positions.size:
            self._pos = positions[-1] + self.step - filtered.size
        else:
            self._pos -= filtered.size
        self._prev_last = float(filtered[-1])
        return out.astype("float32")


# ---------------------------------------------------------------------------
# Capture manager
# ---------------------------------------------------------------------------

class CaptureManager:
    def __init__(self) -> None:
        self._stream = None
        self._closing = False
        self._loop: asyncio.AbstractEventLoop | None = None
        self._chunk_counter = 0
        # Emit meter updates at 10 Hz; capture callbacks must stay lightweight.
        self._level_every = 5
        self._last_is_speech = False
        self._last_acoustic_state = worship_detector.SILENCE
        # Emit a worship/scene decision roughly every ~0.5 s (every 16th frame).
        self._scene_every = 16
        # Optional sink for VAD-passed speech chunks (set by transcription, SS-013).
        # Signature: sink(pcm_bytes: bytes) -> None
        self.speech_sink = None
        # Pre-roll: the most recent audio, replayed into the sink when speech
        # opens. VAD only fires once a word is already underway, so without
        # this every utterance reaches Whisper with its first consonant
        # sheared off — a reliable source of garbled transcripts. Measured in
        # milliseconds of 16 kHz audio, so it holds at any device rate.
        self.preroll_ms = 300.0
        self._preroll: deque[bytes] = deque()
        self._preroll_bytes = 0
        self._forwarding = False
        # "stream" (stateful, anti-aliased) or "legacy" (per-frame linear
        # interpolation, kept for A/B runs in the eval harness).
        self.resampler = "stream"
        self._resampler: StreamResampler | None = None

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

        selected_device = next(
            (
                device
                for device in list_input_devices()
                if device["index"] == audio_state.device_index
            ),
            None,
        )
        if selected_device is None:
            raise ValueError("selected input device is no longer available")
        audio_state.sample_rate = selected_device["default_sample_rate"]
        audio_state.chunk_samples = round(audio_state.sample_rate * 0.02)
        audio_state.channels = min(audio_state.channels, selected_device["channels"])

        self.bind_loop(asyncio.get_running_loop())
        self.reset_frame_state()

        def _open_stream():
            # Opening the PortAudio stream blocks until the OS resolves the
            # microphone-permission prompt. Run it off the event loop so the
            # sidecar (health/WS) stays responsive while permission is pending.
            check_input_settings = getattr(_sd, "check_input_settings", None)
            if check_input_settings is not None:
                check_input_settings(
                    device=audio_state.device_index,
                    samplerate=audio_state.sample_rate,
                    channels=audio_state.channels,
                )
            stream_options = {
                "samplerate": audio_state.sample_rate,
                "channels": audio_state.channels,
                "dtype": "float32",
                "blocksize": audio_state.chunk_samples,
                "device": audio_state.device_index,
                "latency": "high",
                "never_drop_input": True,
                "callback": self._on_audio,
            }
            try:
                stream = _sd.InputStream(**stream_options)
            except Exception as exc:
                if "invalid flag" not in str(exc).lower() and "-9995" not in str(exc):
                    raise
                logger.warning(
                    "PortAudio does not support never_drop_input; "
                    "retrying without that option"
                )
                stream_options.pop("never_drop_input")
                stream = _sd.InputStream(**stream_options)
            stream.start()
            return stream

        try:
            self._stream = await asyncio.to_thread(_open_stream)
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
            self._closing = True

            def _teardown() -> None:
                # Let any in-flight PortAudio callback drain before the stream
                # (and its callback trampoline) is freed; closing mid-callback
                # on the JACK/PipeWire host API crashes the process (SIGILL).
                try:
                    stream.abort()
                    time.sleep(0.2)
                    stream.close()
                except Exception as exc:  # pragma: no cover
                    logger.warning("error stopping stream: %s", exc)

            await asyncio.to_thread(_teardown)
            self._closing = False
        logger.info("capture stopped")

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Event loop that receives the WS events raised by process_frame."""
        self._loop = loop

    def reset_frame_state(self) -> None:
        """Forget per-stream frame state (pre-roll, gate edge, meter cadence)."""
        self._chunk_counter = 0
        self._preroll.clear()
        self._preroll_bytes = 0
        self._forwarding = False
        self._resampler = None

    def _to_transcription_rate(self, samples, sample_rate: int):
        if self.resampler == "legacy":
            return resample_to_transcription_rate(samples, sample_rate)
        r = self._resampler
        if r is None or r.source_rate != int(sample_rate):
            r = self._resampler = StreamResampler(sample_rate)
        return r.process(samples)

    def _push_preroll(self, pcm: bytes) -> None:
        """Keep the current frame plus at least preroll_ms of audio before it."""
        self._preroll.append(pcm)
        self._preroll_bytes += len(pcm)
        budget = int(self.preroll_ms * 16000 * 2 / 1000) + len(pcm)
        while self._preroll and self._preroll_bytes - len(self._preroll[0]) >= budget:
            self._preroll_bytes -= len(self._preroll.popleft())

    def _on_audio(self, indata, frames, time_info, status) -> None:
        """PortAudio callback (runs in a separate thread)."""
        if self._closing:
            return
        if status:
            # e.g. input overflow, or device removed mid-capture.
            logger.warning("audio callback status: %s", status)
            if getattr(status, "input_error", False) or "error" in str(status).lower():
                self._schedule(self._handle_device_error(str(status)))
                return
        self.process_frame(indata.copy(), audio_state.sample_rate)

    def process_frame(self, samples, sample_rate: int) -> None:
        """Run one capture frame through metering, VAD, scene detection and the
        speech gate, forwarding speech to the transcription sink.

        The single entry point for audio: the PortAudio callback and the
        evaluation file source (SS-072) both call this, so a test feed
        exercises exactly the code path the microphone does. `samples` is
        float32 at `sample_rate`, shaped (frames,) or (frames, channels).
        """
        try:
            # The meter shows the device signal; everything that classifies
            # audio sees the same 16 kHz mono array Whisper gets. Silero is a
            # 16 kHz model: fed 48 kHz frames it reads speech three times too
            # slow and an octave and a half too low, and misses most of it.
            rms, peak = compute_levels(samples)
            mono16 = self._to_transcription_rate(samples, sample_rate)
            pcm = float_to_pcm16(mono16)
            scene_rms, _ = compute_levels(mono16)
        except Exception as exc:  # pragma: no cover
            logger.error("audio processing error: %s", exc)
            return

        audio_state.last_rms = rms
        audio_state.last_peak = peak

        # VAD gate (SS-010): classify the chunk; only speech reaches transcription.
        # Pass samples, not just RMS — Silero classifies the waveform itself.
        is_speech, vad_conf = vad.get_detector().process(mono16)

        # Worship/scene detection (SS-012): reduce/pause transcription on music.
        flatness = worship_detector.spectral_flatness(mono16)
        scene, scene_conf = worship_detector.get_detector().update(scene_rms, flatness)
        audio_state.acoustic_state = scene

        self._push_preroll(pcm)

        # Forward to transcription only when it's speech AND not worship/music.
        forward = is_speech and scene != worship_detector.WORSHIP
        tapping = tap.active()
        if tapping:
            tap.emit(
                "frame", is_speech=is_speech, vad_conf=vad_conf, scene=scene,
                scene_conf=scene_conf, forward=forward, rms=rms,
            )
        if forward and self.speech_sink is not None:
            try:
                if not self._forwarding:
                    # Rising edge: replay the pre-roll so the word's onset is
                    # included (the current chunk is the deque's last entry).
                    replay = list(self._preroll)[:-1]
                    for back, past in zip(range(len(replay), 0, -1), replay):
                        if tapping:
                            tap.emit("sink", back=back, nbytes=len(past))
                        self.speech_sink(past)
                if tapping:
                    tap.emit("sink", back=0, nbytes=len(pcm))
                self.speech_sink(pcm)
            except Exception as exc:  # pragma: no cover
                logger.error("speech sink error: %s", exc)
        self._forwarding = forward

        self._chunk_counter += 1
        emit_level = self._chunk_counter % self._level_every == 0
        vad_changed = is_speech != self._last_is_speech
        self._last_is_speech = is_speech

        scene_changed = scene != self._last_acoustic_state
        emit_scene = scene_changed or (self._chunk_counter % self._scene_every == 0)
        self._last_acoustic_state = scene

        if emit_level or vad_changed or emit_scene:
            self._schedule(
                self._emit(
                    rms, peak, emit_level, is_speech, vad_conf, vad_changed,
                    scene, scene_conf, emit_scene,
                )
            )

    def _schedule(self, coro) -> None:
        if self._loop is None:
            coro.close()  # no loop to run on; don't leak the coroutine
            return
        with contextlib.suppress(RuntimeError):  # loop closed
            asyncio.run_coroutine_threadsafe(coro, self._loop)

    async def _emit(
        self,
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
