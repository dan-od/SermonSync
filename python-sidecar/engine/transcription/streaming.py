"""Streaming transcription driver (SS-013).

Accumulates VAD-passed speech PCM (fed from the capture thread) and runs Whisper
inference at a configurable interval, emitting transcription events over the WS
hub. Inference runs in a worker thread so the event loop stays responsive.
"""

from __future__ import annotations

import asyncio
import logging
import time

from ws_hub import manager

from ..monitoring import monitor
from . import whisper_engine
from .buffer import transcript_buffer

logger = logging.getLogger("sermonsync.transcription.streaming")

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None


def pcm16_to_float(data: bytes):
    """Convert little-endian 16-bit PCM bytes to a float32 array in [-1, 1]."""
    if np is None:  # pragma: no cover
        raise RuntimeError("numpy required")
    return np.frombuffer(data, dtype="<i2").astype("float32") / 32768.0


class StreamingTranscriber:
    def __init__(
        self,
        sample_rate: int = 16000,
        max_chunk_seconds: float = 6.0,
        max_buffer_seconds: float = 15.0,
        poll_interval: float = 0.25,
        language: str | None = "en",
        matching_enabled: bool = True,
        min_flush_seconds: float = 0.4,
        silence_flush_seconds: float = 0.45,
        partial_interval: float = 1.0,
        partial_min_seconds: float = 0.8,
        partial_max_seconds: float = 3.0,
    ) -> None:
        self.sample_rate = sample_rate
        # Cut where the speaker pauses, never on a blind timer. Capture feeds
        # only VAD-passed audio, so the buffer is gapless speech and a timer cut
        # always lands mid-word — that is what turned "For God sent not his Son"
        # into "For God's... sent not his son". max_chunk_seconds is only a
        # ceiling for someone who never pauses.
        self.max_chunk_seconds = max_chunk_seconds
        self.max_buffer_seconds = max_buffer_seconds
        self.poll_interval = poll_interval
        # A pause this long ends the utterance. Also the latency floor: text
        # lands this soon after you stop speaking.
        self.min_flush_seconds = min_flush_seconds
        self.silence_flush_seconds = silence_flush_seconds
        # Interim hypotheses while the speaker is still going, so the UI shows
        # words as they are said instead of only at phrase boundaries.
        self.partial_interval = partial_interval
        self.partial_min_seconds = partial_min_seconds
        # Interim passes re-read the buffer without consuming it, so an
        # uncapped window re-transcribes up to max_chunk_seconds every second —
        # ~78% of a core sustained. The interim line only needs recent words.
        self.partial_max_seconds = partial_max_seconds
        self._last_partial_ts = 0.0
        # Pin the language (default English) so short/quiet clips aren't
        # mis-detected as another language. Set None to auto-detect.
        self.language = language
        self.matching_enabled = matching_enabled
        self._buf = bytearray()
        self._lock = None  # created lazily on the loop's thread
        self._running = False
        self._task: asyncio.Task | None = None
        self._first_chunk_ts: float | None = None
        self._last_feed_ts: float | None = None
        # Optional callback(segment: dict) for downstream (buffer/matching).
        self.on_segment = None

    # --- called from the audio capture thread -----------------------------
    def feed(self, pcm: bytes) -> None:
        if not self._running:
            return
        # bytearray.extend is atomic enough for CPython's GIL for our purposes.
        now = time.time()
        if self._first_chunk_ts is None:
            self._first_chunk_ts = now
        self._last_feed_ts = now
        self._buf.extend(pcm)
        # Keep only a short recent window while inference is busy.
        max_bytes = int(self.max_buffer_seconds * self.sample_rate * 2)
        if len(self._buf) > max_bytes:
            del self._buf[: len(self._buf) - max_bytes]

    # --- lifecycle --------------------------------------------------------
    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())
        # Pay model-load cost during sidecar startup so the first spoken word
        # is not delayed by lazy initialization.
        await asyncio.to_thread(whisper_engine.get_engine)
        logger.info("streaming transcriber started")

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            self._task = None
        self._buf.clear()
        self._first_chunk_ts = None
        self._last_feed_ts = None
        logger.info("streaming transcriber stopped")

    def _buffered_seconds(self) -> float:
        return len(self._buf) / (self.sample_rate * 2)

    def _expire_stale_buffer(self, now: float | None = None) -> None:
        if self._first_chunk_ts is None:
            return
        current_time = now if now is not None else time.time()
        if current_time - self._first_chunk_ts > self.max_buffer_seconds:
            self._buf.clear()
            self._first_chunk_ts = None

    def _ready_to_infer(self, now: float | None = None) -> bool:
        """True when the speaker has paused, or the chunk ceiling is reached."""
        buffered = self._buffered_seconds()
        if buffered <= 0:
            return False
        if buffered >= self.max_chunk_seconds:
            return True
        if buffered < self.min_flush_seconds or self._last_feed_ts is None:
            return False
        now = now if now is not None else time.time()
        return (now - self._last_feed_ts) >= self.silence_flush_seconds

    def _ready_for_partial(self, now: float | None = None) -> bool:
        """True when an interim hypothesis is worth emitting mid-utterance."""
        if self._buffered_seconds() < self.partial_min_seconds:
            return False
        now = now if now is not None else time.time()
        return (now - self._last_partial_ts) >= self.partial_interval

    async def _run(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(self.poll_interval)
                if self._ready_to_infer():
                    chunk = bytes(self._buf)
                    self._buf.clear()
                    received_ts = self._first_chunk_ts or time.time()
                    self._first_chunk_ts = None
                    self._last_partial_ts = time.time()
                    await self._infer_and_emit(chunk, received_ts)
                elif self._ready_for_partial():
                    # Transcribe what is buffered WITHOUT consuming it; the
                    # final pass over the complete phrase supersedes this.
                    self._last_partial_ts = time.time()
                    tail = int(self.partial_max_seconds * self.sample_rate * 2)
                    await self._emit_partial(bytes(self._buf[-tail:]))
        except asyncio.CancelledError:  # pragma: no cover
            pass

    async def _emit_partial(self, pcm: bytes) -> None:
        """Broadcast an interim hypothesis (is_final=False). Never assembled
        into sentences and never matched — it will be revised."""
        engine = whisper_engine.get_engine()
        try:
            segments = await asyncio.to_thread(
                engine.transcribe, pcm16_to_float(pcm), self.language
            )
        except Exception as exc:  # pragma: no cover
            logger.debug("partial transcription failed: %s", exc)
            return
        text = " ".join(seg["text"] for seg in segments if seg["text"]).strip()
        if not text:
            return
        transcript_buffer.add_fragment(text, is_final=False, timestamp=time.time())
        await manager.broadcast_json(
            {
                "type": "transcription",
                "text": text,
                "timestamp": time.time(),
                "is_final": False,
                "confidence": 0.0,
                "language": self.language or "en",
                "latency_ms": 0,
            }
        )

    async def _infer_and_emit(self, pcm: bytes, received_ts: float) -> None:
        engine = whisper_engine.get_engine()
        audio = pcm16_to_float(pcm)
        infer_start = time.time()
        try:
            segments = await asyncio.to_thread(engine.transcribe, audio, self.language)
        except Exception as exc:  # pragma: no cover
            logger.error("transcription failed: %s", exc)
            monitor.flag_error("transcription")
            return
        emit_ts = time.time()
        latency_ms = int((emit_ts - received_ts) * 1000)
        # SS-015: record transcription-stage latency and end-to-end latency.
        monitor.record_stage("transcription", (emit_ts - infer_start) * 1000)
        monitor.record_end_to_end(latency_ms)
        monitor.clear_error("transcription")
        for seg in segments:
            if not seg["text"]:
                continue
            payload = {
                "type": "transcription",
                "text": seg["text"],
                "timestamp": emit_ts,
                "is_final": True,
                "confidence": seg["confidence"],
                "language": seg.get("language", "en"),
                "latency_ms": latency_ms,
            }
            await manager.broadcast_json(payload)

            # SS-016: assemble fragments into complete sentences and broadcast
            # them (with rolling context) for the scripture-matching pipeline.
            for sentence in transcript_buffer.add_fragment(
                seg["text"], is_final=True, timestamp=emit_ts
            ):
                await manager.broadcast_json(sentence)
                # SS-044: tie the transcript to the active session for archival.
                from ..session.manager import get_manager

                get_manager().record_event("sentence", sentence)
                # SS-021: run the 4-stage matcher on each assembled sentence and
                # broadcast suggestions (off-loop, fire-and-forget), unless
                # disabled (e.g. by tests that don't stub the matcher chain).
                if self.matching_enabled:
                    from ..matching.orchestrator import get_orchestrator

                    asyncio.create_task(
                        get_orchestrator().match_and_emit(
                            sentence["text"], sentence.get("context")
                        )
                    )
                # SS-022: refresh sermon themes periodically / on topic shift.
                from ..context_detector import get_detector

                theme_update = get_detector().feed(sentence["text"])
                if theme_update is not None:
                    await manager.broadcast_json(theme_update)
                if self.on_segment is not None:
                    try:
                        self.on_segment(sentence)
                    except Exception as exc:  # pragma: no cover
                        logger.error("on_segment callback error: %s", exc)


streaming_transcriber = StreamingTranscriber()
