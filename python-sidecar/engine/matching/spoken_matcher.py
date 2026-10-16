"""Stage 0 — explicitly spoken scripture references.

"Turn with me to John chapter 3 verse 16" names the verse outright; the quote,
keyword, LLM and semantic stages are all guessing by comparison. This stage
runs first, uses the deterministic parser in reference_parser.py, validates
every reference against the Bible DB and short-circuits the cascade like the
other stages.

Live, it keeps a rolling ~15 s text window (ReferenceTracker), so a reference
split across transcription chunks ("John three" | "sixteen") is still found,
carry-over works across sentences ("verse 17" -> the chapter in use), and one
spoken reference yields one suggestion.
"""

from __future__ import annotations

import threading
import time

from ..bible.lookup import fetch_verse
from .reference_parser import (
    RefContext,
    ReferenceTracker,
    SpokenRef,
    parse_references,
)
from .version import get_active_version

# Longest range hydrated into one card ("verses 1 to 40" is a reading, not a
# slide); longer ranges show their first verses.
MAX_RANGE_VERSES = 12


class SpokenReferenceMatcher:
    stage = 0

    def __init__(self, window_seconds: float = 15.0, context_ttl: float = 300.0) -> None:
        self._tracker = ReferenceTracker(window_seconds, context_ttl)
        self._lock = threading.Lock()

    def reset(self) -> None:
        with self._lock:
            self._tracker.reset()

    def _hydrate(self, ref: SpokenRef) -> dict | None:
        version = get_active_version()
        last = min(ref.verse_end or ref.verse, ref.verse + MAX_RANGE_VERSES - 1)
        verses = [
            fetch_verse(ref.book, ref.chapter, v, version) for v in range(ref.verse, last + 1)
        ]
        verses = [v for v in verses if v is not None]
        if not verses:
            return None
        first = verses[0]
        return {
            "reference": ref.reference,
            "book": first["book"],
            "chapter": ref.chapter,
            "verse": ref.verse,
            "verse_end": ref.verse_end,
            "text": " ".join(v["text"] for v in verses),
            "version": first["version"],
            "confidence": ref.confidence,
            "stage": self.stage,
            "kind": ref.kind,
        }

    def match(self, sentence: str, context: list[str] | None = None) -> list[dict]:
        """Stateless: references in `sentence`, with carry-over from `context`
        (the preceding sentences)."""
        ctx = RefContext()
        for previous in context or []:
            parse_references(previous, ctx, include_chapters=True)
        found = (self._hydrate(r) for r in parse_references(sentence, ctx))
        return [r for r in found if r is not None]

    def mentions_reference(self, sentence: str, context: list[str] | None = None) -> bool:
        """Whether `sentence` names a verse at all (new or already suggested)."""
        ctx = RefContext()
        for previous in context or []:
            parse_references(previous, ctx, include_chapters=True)
        return bool(parse_references(sentence, ctx))

    def feed(self, text: str, timestamp: float | None = None) -> list[dict]:
        """Live: add transcript text to the rolling window; returns only
        references not suggested before."""
        ts = time.time() if timestamp is None else timestamp
        with self._lock:
            refs = self._tracker.feed(text, ts, ts)
        found = (self._hydrate(r) for r in refs)
        return [r for r in found if r is not None]


_matcher: SpokenReferenceMatcher | None = None


def get_matcher() -> SpokenReferenceMatcher:
    global _matcher
    if _matcher is None:
        _matcher = SpokenReferenceMatcher()
    return _matcher


def set_matcher(matcher) -> None:
    global _matcher
    _matcher = matcher
