"""Unit tests for Stage 4 semantic matcher (SS-020).

Uses an ephemeral (in-memory) ChromaDB client + MockEmbedder over a small verse
subset, so it verifies the embed -> store -> query flow without the real model
or a persistent store.
"""

from __future__ import annotations

import chromadb
import pytest
from engine.matching.semantic_matcher import MockEmbedder, SemanticMatcher


@pytest.fixture(scope="module")
def matcher():
    client = chromadb.EphemeralClient()
    m = SemanticMatcher(embedder=MockEmbedder(), client=client)
    # Small, fast subset for the flow test.
    m.build_index(limit=1200)
    return m


def test_index_built(matcher):
    assert matcher.count() == 1200


def test_query_returns_ranked_candidates(matcher):
    res = matcher.match("in the beginning God created the heavens", k=5)
    assert 1 <= len(res) <= 5
    # scores present and sorted descending
    scores = [r["confidence"] for r in res]
    assert scores == sorted(scores, reverse=True)
    assert all(r["stage"] == 4 for r in res)


def test_lexical_signal_surfaces_relevant_verse(matcher):
    # MockEmbedder is feature-hashing, so shared distinctive words rank high.
    res = matcher.match("God created the heaven and the earth", k=5)
    refs = [r["reference"] for r in res]
    assert "Genesis 1:1" in refs


def test_mock_embedder_dim_and_norm():
    emb = MockEmbedder()
    vecs = emb.embed(["the lord is my shepherd"])
    assert len(vecs[0]) == 384
    norm = sum(v * v for v in vecs[0]) ** 0.5
    assert abs(norm - 1.0) < 1e-6
