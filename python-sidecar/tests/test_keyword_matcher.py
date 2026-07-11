"""Unit tests for Stage 2 Keyword/BM25 matcher (SS-018)."""

from __future__ import annotations

import pytest
from engine.matching.keyword_matcher import KeywordMatcher

# Verses that legitimately express "love your neighbour as yourself".
NEIGHBOUR_LOVE = {
    "Leviticus 19:18",
    "Matthew 19:19",
    "Matthew 22:39",
    "Mark 12:31",
    "Mark 12:33",
    "Romans 13:9",
    "Romans 13:10",
    "Galatians 5:14",
    "James 2:8",
}


@pytest.fixture(scope="module")
def matcher():
    m = KeywordMatcher()
    m.build_from_db()
    return m


def test_wages_of_sin(matcher):
    res = matcher.match("the wages of sin", k=5)
    assert res[0]["reference"] == "Romans 6:23"
    assert "sin" in res[0]["matched_keywords"]


def test_faith_without_works(matcher):
    res = matcher.match("faith without works is dead", k=5)
    assert res[0]["book"] == "James" and res[0]["chapter"] == 2
    assert res[0]["confidence"] >= 0.8


def test_love_your_neighbor(matcher):
    res = matcher.match("love your neighbor as yourself", k=5)
    assert res[0]["reference"] in NEIGHBOUR_LOVE
    # spelling normalization folded neighbor -> neighbour
    assert "neighbour" in res[0]["matched_keywords"]
    assert "love" in res[0]["matched_keywords"]


def test_topk_limit(matcher):
    assert len(matcher.match("faith hope love charity", k=3)) <= 3


def test_empty_query(matcher):
    assert matcher.match("the and of a to", k=5) == []  # all stopwords


def test_rare_words_rank_higher(matcher):
    # "Melchizedek" is rare/distinctive -> should surface Hebrews/Genesis verses.
    res = matcher.match("Melchizedek priest", k=3)
    assert res
    assert any("Melchizedek".lower() in kw.lower() for kw in res[0]["matched_keywords"])
