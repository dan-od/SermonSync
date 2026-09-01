"""4-stage scripture-matching pipeline orchestrator (SS-021).

Runs the stages in a cascade, short-circuiting as soon as a stage produces a
result at or above its confidence threshold (cheap stages first, expensive LLM/
semantic only as needed). Results from the stages that ran are merged and
deduplicated (same verse -> highest confidence), tagged with their source stage,
and sorted by confidence.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from ws_hub import manager

logger = logging.getLogger("sermonsync.matching.orchestrator")


# Words that carry no scriptural signal on their own. A sentence made only of
# these is filler, not something to match.
_FILLER_WORDS = frozenset(
    {
        "a", "ah", "all", "am", "and", "are", "as", "at", "be", "but", "bye",
        "do", "for", "get", "go", "going", "good", "got", "he", "hello", "her",
        "hey", "hi", "him", "his", "i", "in", "is", "it", "its", "just", "know",
        "like", "me", "mhm", "my", "no", "not", "of", "off", "oh", "ok", "okay",
        "on", "one", "or", "our", "out", "right", "run", "said", "see", "she",
        "so", "thank", "thanks", "that", "the", "their", "them", "then",
        "there", "they", "this", "to", "uh", "um", "up", "us", "very", "was",
        "we", "well", "what", "when", "who", "why", "will", "with", "yeah",
        "yes", "you", "your",
    }
)

# Minimum words before a sentence is worth matching at all.
MIN_MATCH_WORDS = 3


def has_substance(sentence: str) -> bool:
    """Whether a transcript line carries enough signal to be worth matching."""
    words = re.findall(r"[a-z0-9']+", (sentence or "").lower())
    if len(words) < MIN_MATCH_WORDS:
        return False
    # A scripture reference ("John 3:16") is always worth matching, however short.
    if re.search(r"\d+\s*[:.]\s*\d+", sentence or ""):
        return True
    return any(w not in _FILLER_WORDS for w in words)


@dataclass
class PipelineThresholds:
    trie: float = 0.95      # Stage 1 short-circuit
    keyword: float = 0.85   # Stage 2 short-circuit
    llm: float = 0.75       # Stage 3 short-circuit
    min_confidence: float = 0.35  # drop weaker-than-this suggestions


class PipelineOrchestrator:
    def __init__(
        self,
        thresholds: PipelineThresholds | None = None,
        trie=None,
        keyword=None,
        llm=None,
        semantic=None,
    ) -> None:
        self.thresholds = thresholds or PipelineThresholds()
        self._trie = trie
        self._keyword = keyword
        self._llm = llm
        self._semantic = semantic

    # Lazy accessors so the (heavy) matchers build only when first used.
    def _trie_m(self):
        if self._trie is None:
            from .trie_matcher import get_matcher
            self._trie = get_matcher()
        return self._trie

    def _keyword_m(self):
        if self._keyword is None:
            from .keyword_matcher import get_matcher
            self._keyword = get_matcher()
        return self._keyword

    def _llm_m(self):
        if self._llm is None:
            from .llm_matcher import get_matcher
            self._llm = get_matcher()
        return self._llm

    def _semantic_m(self):
        if self._semantic is None:
            from .semantic_matcher import get_matcher
            self._semantic = get_matcher()
        return self._semantic

    @staticmethod
    def _max_conf(results: list[dict]) -> float:
        return max((r["confidence"] for r in results), default=0.0)

    def match(self, sentence: str, context: list[str] | None = None) -> list[dict]:
        """Run the cascade and return merged, sorted suggestions."""
        collected: list[dict] = []
        stages_run: list[int] = []

        # Stage 1 — Trie (explicit quotes)
        s1 = self._trie_m().match(sentence)
        collected.extend(s1)
        stages_run.append(1)
        if self._max_conf(s1) >= self.thresholds.trie:
            return self._finalize(collected, stages_run)

        # Stage 2 — Keyword / BM25
        s2 = self._keyword_m().match(sentence)
        collected.extend(s2)
        stages_run.append(2)
        if self._max_conf(s2) >= self.thresholds.keyword:
            return self._finalize(collected, stages_run)

        # Stage 3 — Contextual LLM
        s3 = self._llm_m().match(sentence, context)
        collected.extend(s3)
        stages_run.append(3)
        if self._max_conf(s3) >= self.thresholds.llm:
            return self._finalize(collected, stages_run)

        # Stage 4 — Neural / semantic (final fallback, low-confidence)
        s4 = self._semantic_m().match(sentence)
        collected.extend(s4)
        stages_run.append(4)
        return self._finalize(collected, stages_run)

    def _finalize(self, results: list[dict], stages_run: list[int]) -> list[dict]:
        best: dict[tuple, dict] = {}
        sources: dict[tuple, set[int]] = {}
        for r in results:
            if r["confidence"] < self.thresholds.min_confidence:
                continue
            key = (r["book"], r["chapter"], r["verse"])
            sources.setdefault(key, set()).add(r["stage"])
            if key not in best or r["confidence"] > best[key]["confidence"]:
                best[key] = r

        merged = []
        for key, r in best.items():
            item = dict(r)
            item["source_stages"] = sorted(sources[key])
            item["confidence_pct"] = round(item["confidence"] * 100, 1)
            merged.append(item)
        merged.sort(key=lambda m: m["confidence"], reverse=True)
        logger.debug("pipeline ran stages %s -> %d suggestions", stages_run, len(merged))
        return merged

    def build_payload(self, sentence: str, context: list[str] | None = None) -> dict:
        results = self.match(sentence, context)
        return {
            "type": "suggestions",
            "sentence": sentence,
            "results": [
                {
                    "reference": r["reference"],
                    "book": r["book"],
                    "chapter": r["chapter"],
                    "verse": r["verse"],
                    "text": r["text"],
                    "version": r["version"],
                    "confidence": r["confidence"],
                    "confidence_pct": r["confidence_pct"],
                    "stage": r["stage"],
                    "source_stages": r["source_stages"],
                }
                for r in results
            ],
        }

    async def match_and_emit(self, sentence: str, context: list[str] | None = None) -> dict | None:
        """Run the pipeline off-loop and broadcast suggestions over the WS hub."""
        import asyncio

        if not has_substance(sentence):
            # Filler ("Thank you.", "Yeah") matches thanksgiving/affirmation
            # verses perfectly well, which is how the deck fills with cards
            # nobody asked for. Cheaper and cleaner to never match it.
            logger.debug("skipping low-substance sentence: %r", sentence)
            return {"type": "suggestions", "sentence": sentence, "results": []}

        try:
            payload = await asyncio.to_thread(self.build_payload, sentence, context)
        except Exception:
            # Fire-and-forget task — never let a matcher bug take down the
            # asyncio loop's exception logging for the whole session.
            logger.exception("scripture matching failed for sentence")
            return None
        if payload["results"]:
            await manager.broadcast_json(payload)
            # SS-044: tie generated suggestions to the active session.
            from ..session.manager import get_manager

            get_manager().record_event("suggestion", payload)
        return payload


_orchestrator = PipelineOrchestrator()


def get_orchestrator() -> PipelineOrchestrator:
    return _orchestrator
