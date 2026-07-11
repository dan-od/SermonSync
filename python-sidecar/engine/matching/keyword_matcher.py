"""Stage 2 — Keyword Index matcher (SS-018).

Builds an in-memory inverted index (BM25) over KJV verse content words and ranks
verses by keyword overlap for paraphrased references. Rare/distinctive words are
weighted higher (idf); query terms appearing close together in a verse get a
proximity bonus.
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict

from database import get_connection

from .text_utils import stems

logger = logging.getLogger("sermonsync.matching.keyword")

# BM25 params.
K1 = 1.5
B = 0.75


class KeywordMatcher:
    stage = 2

    def __init__(self) -> None:
        self._verses: list[tuple] = []          # (book, chapter, verse, text)
        self._doc_stems: list[list[str]] = []    # per-verse stem list
        self._postings: dict[str, dict[int, int]] = defaultdict(dict)  # term->{doc:tf}
        self._doc_len: list[int] = []
        self._avgdl = 0.0
        self._n = 0
        self._built = False

    def build_from_db(self, version: str = "KJV") -> None:
        conn = get_connection()
        try:
            vid = conn.execute(
                "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
                (version,),
            ).fetchone()
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

        total_len = 0
        for book, chapter, verse, text in rows:
            doc_id = len(self._verses)
            self._verses.append((book, chapter, verse, text))
            terms = stems(text)
            self._doc_stems.append(terms)
            self._doc_len.append(len(terms))
            total_len += len(terms)
            tf: dict[str, int] = defaultdict(int)
            for t in terms:
                tf[t] += 1
            for t, count in tf.items():
                self._postings[t][doc_id] = count

        self._n = len(self._verses)
        self._avgdl = total_len / self._n if self._n else 0.0
        self._built = True
        logger.info("keyword index built: %d verses, %d terms", self._n, len(self._postings))

    @property
    def is_built(self) -> bool:
        return self._built

    def _idf(self, term: str) -> float:
        df = len(self._postings.get(term, {}))
        if df == 0:
            return 0.0
        return math.log(1 + (self._n - df + 0.5) / (df + 0.5))

    def _proximity_bonus(self, doc_id: int, query_terms: set[str]) -> float:
        """Small bonus when >=2 distinct query terms appear close together."""
        positions = [
            i for i, t in enumerate(self._doc_stems[doc_id]) if t in query_terms
        ]
        if len(positions) < 2:
            return 0.0
        span = positions[-1] - positions[0]
        distinct = len({self._doc_stems[doc_id][i] for i in positions})
        if distinct < 2:
            return 0.0
        return 0.3 * distinct / (1 + span)

    def match(self, sentence: str, k: int = 5, min_confidence: float = 0.0) -> list[dict]:
        if not self._built:
            self.build_from_db()

        q_terms = stems(sentence)
        q_set = set(q_terms)
        if not q_set:
            return []

        scores: dict[int, float] = defaultdict(float)
        matched_terms: dict[int, set[str]] = defaultdict(set)
        for term in q_set:
            postings = self._postings.get(term)
            if not postings:
                continue
            idf = self._idf(term)
            for doc_id, tf in postings.items():
                dl = self._doc_len[doc_id]
                denom = tf + K1 * (1 - B + B * dl / self._avgdl)
                scores[doc_id] += idf * (tf * (K1 + 1)) / denom
                matched_terms[doc_id].add(term)

        results = []
        for doc_id, score in scores.items():
            score += self._proximity_bonus(doc_id, q_set)
            coverage = len(matched_terms[doc_id]) / len(q_set)
            bm25_norm = score / (score + 5.0)
            confidence = round(min(0.99, 0.45 * coverage + 0.55 * bm25_norm), 4)
            if confidence < min_confidence:
                continue
            book, chapter, verse, text = self._verses[doc_id]
            results.append(
                {
                    "book": book,
                    "chapter": chapter,
                    "verse": verse,
                    "version": "KJV",
                    "reference": f"{book} {chapter}:{verse}",
                    "text": text,
                    "confidence": confidence,
                    "matched_keywords": sorted(matched_terms[doc_id]),
                    "stage": self.stage,
                }
            )

        results.sort(key=lambda m: m["confidence"], reverse=True)
        return results[:k]


_matcher = KeywordMatcher()


def get_matcher() -> KeywordMatcher:
    return _matcher
