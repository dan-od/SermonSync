"""Stage 1 — Explicit Trie matcher for direct scripture quotes (SS-017).

Builds a word-level prefix trie from the KJV verses at startup. Given a
transcript sentence, it slides over the words and walks the trie to find exact
(or near-exact) verse-opening matches — fast, high-precision detection of direct
quotes. Near-matches are scored by a difflib similarity ratio.

Only the first MAX_PREFIX_WORDS of each verse are indexed (quotes are identified
by their opening); this bounds memory while covering the common case.
"""

from __future__ import annotations

import logging
from difflib import SequenceMatcher

from database import get_connection

from .text_utils import STOPWORDS, normalize_words

logger = logging.getLogger("sermonsync.matching.trie")

MIN_MATCH_WORDS = 4
MAX_PREFIX_WORDS = 12
# A high-precision quote match needs distinctive (non-stopword) content — this
# rejects generic biblical-cadence openers like "and he said unto them the".
MIN_CONTENT_WORDS = 2


class _Node:
    __slots__ = ("children", "verse_ids")

    def __init__(self) -> None:
        self.children: dict[str, _Node] = {}
        self.verse_ids: list[int] = []


class TrieMatcher:
    stage = 1

    def __init__(self) -> None:
        self._root = _Node()
        # verse_id -> (book, chapter, verse, text, norm_words)
        self._verses: list[tuple] = []
        self._built = False

    def build_from_db(self, version: str = "KJV") -> None:
        conn = get_connection()
        try:
            vid = conn.execute(
                "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
                (version,),
            ).fetchone()
            if vid is None:
                raise RuntimeError(f"version {version} not found")
            rows = conn.execute(
                """
                SELECT b.name, ch.number, v.verse_number, v.text
                FROM verses v
                JOIN chapters ch ON v.chapter_id = ch.id
                JOIN books b ON ch.book_id = b.id
                WHERE v.version_id = ?
                """,
                (vid["id"],),
            ).fetchall()
        finally:
            conn.close()

        for book, chapter, verse, text in rows:
            words = normalize_words(text)
            if not words:
                continue
            verse_id = len(self._verses)
            self._verses.append((book, chapter, verse, text, words))
            self._insert(words[:MAX_PREFIX_WORDS], verse_id)

        self._built = True
        logger.info("trie built from %d %s verses", len(self._verses), version)

    def _insert(self, words: list[str], verse_id: int) -> None:
        node = self._root
        for depth, word in enumerate(words):
            node = node.children.setdefault(word, _Node())
            if depth + 1 >= MIN_MATCH_WORDS:
                node.verse_ids.append(verse_id)

    @property
    def is_built(self) -> bool:
        return self._built

    def match(self, sentence: str, min_confidence: float = 0.8) -> list[dict]:
        """Return verse matches for a transcript sentence (best per verse)."""
        if not self._built:
            self.build_from_db()

        words = normalize_words(sentence)
        best: dict[int, dict] = {}

        for start in range(len(words)):
            node = self._root
            matched: list[str] = []
            deepest_ids: list[int] = []
            deepest_len = 0
            for word in words[start:]:
                child = node.children.get(word)
                if child is None:
                    break
                node = child
                matched.append(word)
                if node.verse_ids:
                    deepest_ids = node.verse_ids
                    deepest_len = len(matched)

            if deepest_len < MIN_MATCH_WORDS:
                continue

            span_words = words[start : start + deepest_len]
            content = [w for w in span_words if w not in STOPWORDS]
            if len(content) < MIN_CONTENT_WORDS:
                continue  # not distinctive enough to be a confident quote
            matched_text = " ".join(span_words)
            for verse_id in deepest_ids:
                book, chapter, verse, text, vwords = self._verses[verse_id]
                verse_prefix = " ".join(vwords[:deepest_len])
                ratio = SequenceMatcher(None, matched_text, verse_prefix).ratio()
                # Longer exact runs and richer content are more trustworthy.
                length_factor = min(1.0, deepest_len / 8.0)
                content_factor = min(1.0, len(content) / 3.0)
                confidence = round(
                    ratio * (0.6 + 0.25 * length_factor + 0.15 * content_factor), 4
                )
                if confidence < min_confidence:
                    continue
                prev = best.get(verse_id)
                if prev is None or confidence > prev["confidence"]:
                    best[verse_id] = {
                        "book": book,
                        "chapter": chapter,
                        "verse": verse,
                        "version": "KJV",
                        "reference": f"{book} {chapter}:{verse}",
                        "text": text,
                        "matched_text": matched_text,
                        "confidence": confidence,
                        "stage": self.stage,
                    }

        return sorted(best.values(), key=lambda m: m["confidence"], reverse=True)


_matcher = TrieMatcher()


def get_matcher() -> TrieMatcher:
    return _matcher
