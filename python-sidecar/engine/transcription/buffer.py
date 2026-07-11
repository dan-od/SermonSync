"""Transcript segment buffering and sentence assembly (SS-016).

Assembles Whisper fragments (partial + final) into complete sentences using
punctuation and a silence-gap threshold, handles partial revisions, and keeps a
rolling context window for the LLM matcher (SS-019).

Pure/synchronous by design — `add_fragment` returns the list of newly completed
sentence dicts so the async layer can broadcast/route them.
"""

from __future__ import annotations

import re
import time
from collections import deque

# Sentence terminators per spec: . ? ! ;
_SENTENCE_SPLIT = re.compile(r"(?<=[.?!;])\s+")
_ENDS_SENTENCE = re.compile(r"[.?!;]\s*$")


class TranscriptBuffer:
    def __init__(
        self,
        context_size: int = 5,
        silence_gap: float = 2.0,
        on_sentence=None,
    ) -> None:
        self.context: deque[str] = deque(maxlen=context_size)
        self.silence_gap = silence_gap
        self.on_sentence = on_sentence
        self._buffer = ""          # committed-final text not yet split into sentences
        self._partial = ""         # latest partial hypothesis (revisable)
        self._last_ts: float | None = None

    # ------------------------------------------------------------------
    @property
    def partial(self) -> str:
        return self._partial

    def get_context(self) -> list[str]:
        return list(self.context)

    def add_fragment(
        self, text: str, is_final: bool = True, timestamp: float | None = None
    ) -> list[dict]:
        """Add a Whisper fragment. Returns any newly completed sentences."""
        now = timestamp if timestamp is not None else time.time()
        emitted: list[dict] = []

        # Silence-gap flush: a long pause finalizes whatever is buffered even
        # without terminating punctuation.
        if (
            self._last_ts is not None
            and now - self._last_ts > self.silence_gap
            and self._buffer.strip()
        ):
            flushed = self._flush_sentence(now)
            if flushed:
                emitted.append(flushed)

        self._last_ts = now
        text = (text or "").strip()

        if not is_final:
            # Partial hypothesis revises the current interim; not emitted yet.
            self._partial = text
            return emitted

        # Final fragment supersedes any partial and is appended to the buffer.
        self._partial = ""
        if text:
            self._buffer = (self._buffer + " " + text).strip()
        emitted.extend(self._extract_sentences(now))
        return emitted

    def flush(self, timestamp: float | None = None) -> list[dict]:
        """Force-finalize any buffered remainder (e.g. on session end)."""
        now = timestamp if timestamp is not None else time.time()
        flushed = self._flush_sentence(now)
        return [flushed] if flushed else []

    # ------------------------------------------------------------------
    def _extract_sentences(self, ts: float) -> list[dict]:
        out: list[dict] = []
        tokens = _SENTENCE_SPLIT.split(self._buffer)
        remainder = ""
        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            if _ENDS_SENTENCE.search(tok):
                out.append(self._emit_sentence(tok, ts))
            else:
                remainder = tok  # trailing incomplete fragment
        self._buffer = remainder
        return out

    def _flush_sentence(self, ts: float) -> dict | None:
        text = self._buffer.strip()
        self._buffer = ""
        if not text:
            return None
        return self._emit_sentence(text, ts)

    def _emit_sentence(self, text: str, ts: float) -> dict:
        payload = {
            "type": "sentence",
            "text": text,
            "timestamp": ts,
            "context": list(self.context),
        }
        # Push AFTER capturing context so context holds prior sentences only.
        self.context.append(text)
        if self.on_sentence is not None:
            self.on_sentence(payload)
        return payload


transcript_buffer = TranscriptBuffer()
