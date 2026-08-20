"""Scripture-matching accuracy + robustness regression (SS-059 / SS-061).

Runs the real cascade (trie + keyword + mock LLM; semantic stubbed for speed)
over the curated dataset and guards against accuracy regressions and false
positives on adversarial / non-biblical input.
"""

from __future__ import annotations

import pytest
from engine.eval.accuracy import (
    evaluate_orchestrator,
    evaluate_stage,
)
from engine.matching.keyword_matcher import get_matcher as keyword_matcher
from engine.matching.llm_matcher import get_matcher as llm_matcher
from engine.matching.orchestrator import PipelineOrchestrator
from engine.matching.trie_matcher import get_matcher as trie_matcher


class _EmptyMatcher:
    def match(self, *args, **kwargs):
        return []


@pytest.fixture(scope="module")
def orchestrator():
    return PipelineOrchestrator(
        trie=trie_matcher(),
        keyword=keyword_matcher(),
        llm=llm_matcher(),
        semantic=_EmptyMatcher(),  # keep the regression fast + deterministic
    )


def test_top1_accuracy_regression(orchestrator):
    metrics = evaluate_orchestrator(orchestrator)
    # Observed 1.0; guard at 0.8 so this is a real regression trip-wire.
    assert metrics["top1_accuracy"] >= 0.8, metrics["positive_detail"]


def test_no_false_positives_on_negatives(orchestrator):
    metrics = evaluate_orchestrator(orchestrator)
    assert metrics["false_positives"] == 0, metrics["negative_detail"]


def test_keyword_stage_recall(orchestrator):
    assert evaluate_stage(keyword_matcher())["recall_at_k"] >= 0.8


def test_trie_stage_catches_direct_quotes(orchestrator):
    assert evaluate_stage(trie_matcher())["recall_at_k"] >= 0.4


@pytest.mark.parametrize(
    "text",
    ["", "the", "uh", "hmm okay so", "let's take the offering now please"],
)
def test_edge_inputs_no_confident_match(orchestrator, text):
    """Empty / filler / very short / non-biblical -> no confident match (SS-061)."""
    results = orchestrator.match(text)
    assert all(r["confidence"] < 0.85 for r in results), (text, results[:2])
