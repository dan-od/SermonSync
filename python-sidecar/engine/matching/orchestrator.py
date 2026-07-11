"""4-stage scripture-matching pipeline orchestrator (SS-021).

Runs the stages in a cascade, short-circuiting as soon as a stage produces a
result at or above its confidence threshold (cheap stages first, expensive LLM/
semantic only as needed). Results from the stages that ran are merged and
deduplicated (same verse -> highest confidence), tagged with their source stage,
and sorted by confidence.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from ws_hub import manager

logger = logging.getLogger("sermonsync.matching.orchestrator")


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

    async def match_and_emit(self, sentence: str, context: list[str] | None = None) -> dict:
        """Run the pipeline off-loop and broadcast suggestions over the WS hub."""
        import asyncio

        payload = await asyncio.to_thread(self.build_payload, sentence, context)
        if payload["results"]:
            await manager.broadcast_json(payload)
        return payload


_orchestrator = PipelineOrchestrator()


def get_orchestrator() -> PipelineOrchestrator:
    return _orchestrator
