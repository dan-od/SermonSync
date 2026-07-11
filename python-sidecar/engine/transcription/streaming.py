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

from . import whisper_engine

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
        min_infer_seconds: float = 1.5,
        max_buffer_seconds: float = 15.0,
        poll_interval: float = 0.25,
    ) -> None:
        self.sample_rate = sample_rate
        self.min_infer_seconds = min_infer_seconds
        self.max_buffer_seconds = max_buffer_seconds
        self.poll_interval = poll_interval
        self._buf = bytearray()
        self._lock = None  # created lazily on the loop's thread
        self._running = False
        self._task: asyncio.Task | None = None
        self._first_chunk_ts: float | None = None
        # Optional callback(segment: dict) for downstream (buffer/matching).
        self.on_segment = None

    # --- called from the audio capture thread -----------------------------
    def feed(self, pcm: bytes) -> None:
        if not self._running:
            return
        # bytearray.extend is atomic enough for CPython's GIL for our purposes.
        if self._first_chunk_ts is None:
            self._first_chunk_ts = time.time()
        self._buf.extend(pcm)
        # Cap runaway buffering.
        max_bytes = int(self.max_buffer_seconds * self.sample_rate * 2)
        if len(self._buf) > max_bytes:
            del self._buf[: len(self._buf) - max_bytes]

    # --- lifecycle --------------------------------------------------------
    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())
        logger.info("streaming transcriber started")

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            self._task = None
        self._buf.clear()
        self._first_chunk_ts = None
        logger.info("streaming transcriber stopped")

    def _buffered_seconds(self) -> float:
        return len(self._buf) / (self.sample_rate * 2)

    async def _run(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(self.poll_interval)
                if self._buffered_seconds() < self.min_infer_seconds:
                    continue
                chunk = bytes(self._buf)
                self._buf.clear()
                received_ts = self._first_chunk_ts or time.time()
                self._first_chunk_ts = None
                await self._infer_and_emit(chunk, received_ts)
        except asyncio.CancelledError:  # pragma: no cover
            pass

    async def _infer_and_emit(self, pcm: bytes, received_ts: float) -> None:
        engine = whisper_engine.get_engine()
        audio = pcm16_to_float(pcm)
        try:
            segments = await asyncio.to_thread(engine.transcribe, audio)
        except Exception as exc:  # pragma: no cover
            logger.error("transcription failed: %s", exc)
            return
        emit_ts = time.time()
        latency_ms = int((emit_ts - received_ts) * 1000)
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
            if self.on_segment is not None:
                try:
                    self.on_segment(seg)
                except Exception as exc:  # pragma: no cover
                    logger.error("on_segment callback error: %s", exc)


streaming_transcriber = StreamingTranscriber()
