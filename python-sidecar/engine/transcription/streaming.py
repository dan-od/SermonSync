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

from ..eval import tap
from ..monitoring import monitor
from . import whisper_engine
from .buffer import transcript_buffer

logger = logging.getLogger("sermonsync.transcription.streaming")
STALE_BUFFER_SECONDS = 3.0
# Interim-pass modes: re-run the main model (default), skip interim passes, or
# run them on a small model so they stop competing with finals for compute.
PARTIAL_MODES = ("main", "off", "tiny.en", "base.en")

# Whisper copies a prompt's style and spelling: written references and local
# names, not instructions. Well under the 224-token prompt limit.
STYLE_PROMPT = (
    "Turn with me to John 3:16, 1 Corinthians 13:4-7 and Philippians 4:13. "
    "Foursquare Gospel Church."
)
FINAL_TAIL_CHARS = 200

# Text Whisper produces from silence, music and noise (its training data's
# subtitle credits). Dropped only when a chunk yields nothing else.
HALLUCINATION_PHRASES = frozenset({
    "thank you", "thank you very much", "thanks", "thanks for watching",
    "thank you for watching", "thank you so much for watching", "please subscribe",
    "like and subscribe", "you", "bye", "bye bye", "music", "applause",
})
HALLUCINATION_PREFIXES = ("subtitles by", "captions by", "transcription by", "translated by")
# A chunk this short that decodes to one or two words is almost always noise
# or music read as speech ("Three", "Zoom!", "haha"). Measured on six sermon
# runs with the VAD fix: catches 13 of 28 caption-free finals and drops 12 of
# 13,435 real words. A no_speech_prob/avg_logprob rule did far worse
# (3 caught, 2.2% of real words lost): most hallucinations score as speech.
# faster-whisper already skips segments with no_speech > 0.6 and logprob < -1.
SHORT_CHUNK_SECONDS = 1.2
SHORT_CHUNK_MAX_WORDS = 2


def _bare(text: str) -> str:
    return " ".join("".join(c if c.isalnum() or c == " " else " " for c in text.lower()).split())


def hallucination_reason(
    segment: dict, alone: bool, chunk_seconds: float | None = None
) -> str | None:
    """Why a segment should be dropped, or None to keep it."""
    bare = _bare(segment.get("text") or "")
    if (
        alone
        and chunk_seconds is not None
        and chunk_seconds < SHORT_CHUNK_SECONDS
        and len(bare.split()) <= SHORT_CHUNK_MAX_WORDS
    ):
        return "short_chunk"
    if alone and (bare in HALLUCINATION_PHRASES or bare.startswith(HALLUCINATION_PREFIXES)):
        return "blocklist"
    return None

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
        silence_flush_seconds: float = 0.8,
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
        # lands this soon after you stop speaking. 0.8 s (was 0.45) stops
        # cutting at breaths mid-sentence: WER −0.01 to −0.04 for +0.05 to
        # +0.2 s word delay in the SS-072 sweep (eval/results/utterance-segmentation).
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
        self.partial_mode = "main"
        # Pin the language (default English) so short/quiet clips aren't
        # mis-detected as another language. Set None to auto-detect.
        self.language = language
        self.matching_enabled = matching_enabled
        # Decoding hints (fix C): "none", "final_tail" (last ~200 chars of
        # final text) or "style" (STYLE_PROMPT); optionally passed as
        # faster-whisper hotwords instead of initial_prompt.
        self.prompt_mode = "none"
        self.style_prompt = STYLE_PROMPT
        self.prompt_as_hotwords = False
        self.hallucination_filter = True
        self._final_tail = ""
        self._buf = bytearray()
        self._lock = None  # created lazily on the loop's thread
        self._running = False
        self._task: asyncio.Task | None = None
        self._first_chunk_ts: float | None = None
        self._last_feed_ts: float | None = None
        # Cumulative byte offsets into the fed stream: total bytes ever fed,
        # and the offset of _buf[0]. Lets the eval harness (SS-072) map every
        # chunk, drop and trim back to the audio it came from.
        self._fed_bytes = 0
        self._buf_offset = 0
        self._chunk_seq = 0
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
        self._fed_bytes += len(pcm)
        # Keep only a short recent window while inference is busy.
        max_bytes = int(self.max_buffer_seconds * self.sample_rate * 2)
        if len(self._buf) > max_bytes:
            dropped = len(self._buf) - max_bytes
            del self._buf[:dropped]
            start = self._buf_offset
            self._buf_offset += dropped
            tap.emit("chunk_drop", reason="trim", byte_start=start, byte_end=start + dropped)

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
        self._buf_offset = self._fed_bytes
        self._first_chunk_ts = None
        self._last_feed_ts = None
        logger.info("streaming transcriber stopped")

    def reset(self) -> None:
        """Drop buffered audio without stopping (a new, unrelated stream)."""
        self._final_tail = ""
        self._buf.clear()
        self._buf_offset = self._fed_bytes
        self._first_chunk_ts = None
        self._last_feed_ts = None
        self._last_partial_ts = 0.0

    @property
    def fed_bytes(self) -> int:
        return self._fed_bytes

    def _buffered_seconds(self) -> float:
        return len(self._buf) / (self.sample_rate * 2)

    def _expire_stale_buffer(self, now: float | None = None) -> None:
        if self._last_feed_ts is None:
            return
        current_time = now if now is not None else time.time()
        # Sub-threshold fragments cannot be flushed. Drop them after a long
        # pause so the next utterance does not inherit stale audio.
        if current_time - self._last_feed_ts >= STALE_BUFFER_SECONDS:
            start, n = self._buf_offset, len(self._buf)
            self._buf.clear()
            self._buf_offset = self._fed_bytes
            if n:
                tap.emit("chunk_drop", reason="stale_drop", byte_start=start, byte_end=start + n)
            self._first_chunk_ts = None
            self._last_feed_ts = None

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

    def _decode_hints(self) -> dict:
        """Keyword arguments for engine.transcribe (only when set, so engines
        without prompt support keep working)."""
        text = None
        if self.prompt_mode == "final_tail":
            text = self._final_tail[-FINAL_TAIL_CHARS:].strip() or None
        elif self.prompt_mode == "style":
            text = self.style_prompt
        if not text:
            return {}
        return {"hotwords": text} if self.prompt_as_hotwords else {"prompt": text}

    def _cut_reason(self) -> str:
        """Why the buffer is being cut: the ceiling, or a speaker pause."""
        return "ceiling" if self._buffered_seconds() >= self.max_chunk_seconds else "pause"

    def set_partial_mode(self, mode: str) -> None:
        if mode not in PARTIAL_MODES:
            raise ValueError(f"partial mode must be one of {PARTIAL_MODES}")
        self.partial_mode = mode
        logger.info("interim transcription: %s", mode)

    def _partial_engine(self):
        if self.partial_mode in ("main", "off"):
            return whisper_engine.get_engine()
        return whisper_engine.get_partial_engine(self.partial_mode)

    def _ready_for_partial(self, now: float | None = None) -> bool:
        """True when an interim hypothesis is worth emitting mid-utterance."""
        if self.partial_mode == "off":
            return False
        if self._buffered_seconds() < self.partial_min_seconds:
            return False
        now = now if now is not None else time.time()
        return (now - self._last_partial_ts) >= self.partial_interval

    async def _run(self) -> None:
        try:
            while self._running:
                await asyncio.sleep(self.poll_interval)
                if self._ready_to_infer():
                    reason = self._cut_reason()
                    chunk = bytes(self._buf)
                    start = self._buf_offset
                    self._buf.clear()
                    self._buf_offset = self._fed_bytes
                    self._chunk_seq += 1
                    tap.emit(
                        "chunk", seq=self._chunk_seq, reason=reason,
                        byte_start=start, byte_end=start + len(chunk),
                        duration=round(len(chunk) / (self.sample_rate * 2), 3),
                    )
                    received_ts = self._first_chunk_ts or time.time()
                    self._first_chunk_ts = None
                    self._last_partial_ts = time.time()
                    await self._infer_and_emit(chunk, received_ts, self._chunk_seq)
                else:
                    self._expire_stale_buffer()
                    if not self._ready_for_partial():
                        continue
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
        # Loading a small partial model can take seconds: never on the loop.
        engine = await asyncio.to_thread(self._partial_engine)
        infer_start = time.time()
        try:
            segments = await asyncio.to_thread(
                engine.transcribe, pcm16_to_float(pcm), self.language, **self._decode_hints()
            )
        except Exception as exc:  # pragma: no cover
            logger.debug("partial transcription failed: %s", exc)
            return
        if self.hallucination_filter:
            alone = len([s for s in segments if s["text"]]) == 1
            segments = [s for s in segments if hallucination_reason(s, alone) is None]
        text = " ".join(seg["text"] for seg in segments if seg["text"]).strip()
        tap.emit(
            "partial", text=text, infer_ms=round((time.time() - infer_start) * 1000, 1),
            duration=round(len(pcm) / (self.sample_rate * 2), 3),
        )
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

    async def _infer_and_emit(self, pcm: bytes, received_ts: float, seq: int = 0) -> None:
        engine = whisper_engine.get_engine()
        audio = pcm16_to_float(pcm)
        infer_start = time.time()
        try:
            segments = await asyncio.to_thread(
                engine.transcribe, audio, self.language, **self._decode_hints()
            )
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
        if self.hallucination_filter:
            alone = len([s for s in segments if s["text"]]) == 1
            for seg in segments:
                reason = hallucination_reason(seg, alone, len(audio) / self.sample_rate)
                if reason:
                    seg["dropped"] = reason
                    logger.info("dropped likely hallucination (%s): %r", reason, seg["text"])
        if tap.active():
            tap.emit(
                "inference", seq=seq, infer_ms=round((emit_ts - infer_start) * 1000, 1),
                latency_ms=latency_ms, duration=round(len(audio) / self.sample_rate, 3),
                segments=[
                    {k: seg.get(k) for k in (
                        "text", "start", "end", "confidence", "no_speech_prob",
                        "avg_logprob", "compression_ratio", "dropped",
                    )}
                    for seg in segments
                ],
            )
        for seg in segments:
            if not seg["text"] or seg.get("dropped"):
                continue
            self._final_tail = (self._final_tail + " " + seg["text"])[-FINAL_TAIL_CHARS * 2:]
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
