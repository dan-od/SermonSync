"""Unit tests for Stage 3 LLM matcher (SS-019) — mock path + parsing."""

from __future__ import annotations

from engine.matching.llm_matcher import (
    MockLLMMatcher,
    _hydrate,
    _parse_refs,
    get_matcher,
)


def test_mock_detects_allusion():
    m = MockLLMMatcher()
    res = m.match("the preacher spoke about the prodigal son returning home")
    assert res
    assert res[0]["reference"] == "Luke 15:11"
    assert res[0]["stage"] == 3
    assert res[0]["text"]  # hydrated from DB


def test_mock_uses_context():
    m = MockLLMMatcher()
    res = m.match(
        "he came back to his father",
        context=["there was a man who had a prodigal son"],
    )
    assert any(r["reference"] == "Luke 15:11" for r in res)


def test_mock_no_allusion():
    m = MockLLMMatcher()
    assert m.match("today we review the church budget") == []


def test_parse_refs_from_llm_text():
    text = 'Here you go: [{"book": "John", "chapter": 3, "verse": 16, "confidence": 0.9}]'
    refs = _parse_refs(text)
    assert refs == [{"book": "John", "chapter": 3, "verse": 16, "confidence": 0.9}]


def test_parse_refs_handles_garbage():
    assert _parse_refs("no json here") == []


def test_hydrate_validates_against_db():
    good = _hydrate([{"book": "John", "chapter": 3, "verse": 16}], stage=3)
    assert good and good[0]["reference"] == "John 3:16"
    # Non-existent verse is dropped.
    bad = _hydrate([{"book": "John", "chapter": 999, "verse": 1}], stage=3)
    assert bad == []


def test_get_matcher_defaults_to_mock(monkeypatch):
    monkeypatch.delenv("LLM_MODEL_PATH", raising=False)
    from engine.matching import llm_matcher

    llm_matcher.set_matcher(None)
    m = get_matcher()
    assert getattr(m, "is_mock", False) is True
    llm_matcher.set_matcher(None)
