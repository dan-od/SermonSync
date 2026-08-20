"""Unit tests for the Groq cloud LLM fallback (SS-050).

The HTTP transport is mocked, so these run offline with no real API key.
"""

from __future__ import annotations

import urllib.error

from engine.matching import llm_matcher
from engine.matching.groq_matcher import GroqMatcher


def _fake_transport(content):
    def transport(url, headers, body, timeout=20.0):
        assert "api.groq.com" in url
        assert headers["Authorization"].startswith("Bearer ")
        return {"choices": [{"message": {"content": content}}]}
    return transport


def test_groq_match_parses_and_hydrates():
    content = '[{"book": "John", "chapter": 3, "verse": 16, "confidence": 0.9}]'
    m = GroqMatcher(api_key="test-key", transport=_fake_transport(content))
    res = m.match("for God so loved the world")
    assert res and res[0]["reference"] == "John 3:16"
    assert res[0]["stage"] == 3
    assert res[0]["text"]  # hydrated from DB


def test_groq_degrades_gracefully_on_error():
    def boom(url, headers, body, timeout=20.0):
        raise urllib.error.URLError("network down")

    m = GroqMatcher(api_key="k", transport=boom)
    assert m.match("anything") == []  # falls through, never raises


def test_groq_test_connection_ok():
    m = GroqMatcher(api_key="k", transport=_fake_transport("ok"))
    result = m.test_connection()
    assert result["ok"] is True
    assert result["sample"] == "ok"


def test_configure_groq_routes_stage3(monkeypatch):
    llm_matcher.set_matcher(None)
    llm_matcher.configure_groq(True, "test-key", "llama-3.3-70b-versatile")
    m = llm_matcher.get_matcher()
    assert isinstance(m, GroqMatcher)
    assert m.model == "llama-3.3-70b-versatile"
    # disabling resets back to local/mock evaluation
    llm_matcher.configure_groq(False, None)
    assert not isinstance(llm_matcher.get_matcher(), GroqMatcher)
    llm_matcher.set_matcher(None)
