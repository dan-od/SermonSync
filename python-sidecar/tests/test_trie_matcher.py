"""Unit tests for Stage 1 Trie matcher (SS-017).

Builds the trie from the real bundled KJV bible.db and checks known quotes.
"""

from __future__ import annotations

import pytest
from engine.matching.trie_matcher import TrieMatcher


@pytest.fixture(scope="module")
def matcher():
    m = TrieMatcher()
    m.build_from_db()
    return m


def _top(matcher, sentence):
    res = matcher.match(sentence)
    return res[0] if res else None


def test_john_3_16(matcher):
    top = _top(matcher, "For God so loved the world")
    assert top is not None
    assert top["reference"] == "John 3:16"
    assert top["confidence"] >= 0.8
    assert top["stage"] == 1


def test_psalm_23_1(matcher):
    top = _top(matcher, "The Lord is my shepherd")
    assert top is not None
    assert top["reference"] == "Psalms 23:1"
    assert top["confidence"] >= 0.8


def test_genesis_1_1(matcher):
    top = _top(matcher, "In the beginning God created")
    assert top is not None
    assert top["reference"] == "Genesis 1:1"


def test_quote_embedded_in_sentence(matcher):
    top = _top(matcher, "the preacher said for God so loved the world today")
    assert top is not None
    assert top["reference"] == "John 3:16"


def test_generic_cadence_not_matched(matcher):
    # All-stopword opener should be rejected by the content-word gate.
    res = matcher.match("and he said unto them the food is ready")
    assert all(r["reference"] != "1 Samuel 12:5" for r in res)


def test_non_scripture_no_match(matcher):
    assert matcher.match("let us review the quarterly budget spreadsheet") == []
