"""Unit tests for the Groq cloud LLM fallback (SS-050).

The HTTP transport is mocked, so these run offline with no real API key.
"""

from __future__ import annotations

import io
import urllib.error

from engine.matching import llm_matcher
from engine.matching.groq_matcher import GroqMatcher, describe_key_problem

# Shaped like a real Groq console key so format validation passes.
_VALID_KEY = "gsk_" + "a1B2c3D4e5F6g7H8i9J0" * 2 + "kLmNoPqR"


def _fake_transport(content):
    def transport(url, headers, body, timeout=20.0):
        assert "api.groq.com" in url
        assert headers["Authorization"].startswith("Bearer ")
        return {"choices": [{"message": {"content": content}}]}
    return transport


def test_groq_match_parses_and_hydrates():
    content = '[{"book": "John", "chapter": 3, "verse": 16, "confidence": 0.9}]'
    m = GroqMatcher(api_key=_VALID_KEY, transport=_fake_transport(content))
    res = m.match("for God so loved the world")
    assert res and res[0]["reference"] == "John 3:16"
    assert res[0]["stage"] == 3
    assert res[0]["text"]  # hydrated from DB


def test_groq_degrades_gracefully_on_error():
    def boom(url, headers, body, timeout=20.0):
        raise urllib.error.URLError("network down")

    m = GroqMatcher(api_key=_VALID_KEY, transport=boom)
    assert m.match("anything") == []  # falls through, never raises


def test_groq_test_connection_ok():
    m = GroqMatcher(api_key=_VALID_KEY, transport=_fake_transport("ok"))
    result = m.test_connection()
    assert result["ok"] is True
    assert result["sample"] == "ok"


def test_configure_groq_routes_stage3(monkeypatch):
    llm_matcher.set_matcher(None)
    llm_matcher.configure_groq(True, _VALID_KEY, "llama-3.3-70b-versatile")
    m = llm_matcher.get_matcher()
    assert isinstance(m, GroqMatcher)
    assert m.model == "llama-3.3-70b-versatile"
    # disabling resets back to local/mock evaluation
    llm_matcher.configure_groq(False, None)
    assert not isinstance(llm_matcher.get_matcher(), GroqMatcher)
    llm_matcher.set_matcher(None)


# --- Regression: the 403 root cause + visible failures ---------------------


def test_request_sends_real_user_agent():
    """urllib's default UA is 403'd by Groq's edge (Cloudflare 1010).

    Without an explicit User-Agent even a valid key fails, which is exactly the
    bug this guards: the header must be present and must not be urllib's.
    """
    seen = {}

    def transport(url, headers, body, timeout=20.0):
        seen.update(headers)
        return {"choices": [{"message": {"content": "[]"}}]}

    GroqMatcher(api_key=_VALID_KEY, transport=transport).match("hello")
    assert "User-Agent" in seen
    assert "python-urllib" not in seen["User-Agent"].lower()
    assert seen["Accept"] == "application/json"


def _http_error(code, body, reason="Forbidden"):
    def transport(url, headers, body_, timeout=20.0):
        raise urllib.error.HTTPError(
            url, code, reason, {}, io.BytesIO(body.encode("utf-8"))
        )
    return transport


def test_cloudflare_block_is_classified_not_reported_as_bad_key():
    m = GroqMatcher(api_key=_VALID_KEY, transport=_http_error(403, "error code: 1010"))
    assert m.match("anything") == []
    err = m.health()["last_error"]
    assert err["kind"] == "blocked"
    assert "User-Agent" in err["hint"]


def test_invalid_key_surfaces_as_auth_error_and_trips_circuit():
    body = '{"error":{"message":"Invalid API Key","code":"invalid_api_key"}}'
    calls = []

    def transport(url, headers, b, timeout=20.0):
        calls.append(1)
        raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, io.BytesIO(body.encode()))

    m = GroqMatcher(api_key=_VALID_KEY, transport=transport)
    assert m.match("one") == []
    health = m.health()
    assert health["last_error"]["kind"] == "auth"
    assert health["last_error"]["message"] == "Invalid API Key"
    assert health["circuit_permanently_open"] is True
    # A hard failure must stop hammering Groq once per transcribed sentence.
    m.match("two")
    m.match("three")
    assert len(calls) == 1


def test_decommissioned_model_is_classified():
    body = '{"error":{"message":"model has been decommissioned","code":"model_decommissioned"}}'
    m = GroqMatcher(api_key=_VALID_KEY, transport=_http_error(400, body, "Bad Request"))
    assert m.match("x") == []
    assert m.health()["last_error"]["kind"] == "model"


def test_placeholder_key_is_rejected_before_any_network_call():
    assert describe_key_problem("gsk_fake") is not None
    assert describe_key_problem("") is not None
    assert describe_key_problem("sk-not-a-groq-key") is not None
    assert describe_key_problem(_VALID_KEY) is None

    def transport(url, headers, body, timeout=20.0):
        raise AssertionError("must not reach the network with a placeholder key")

    m = GroqMatcher(api_key="gsk_fake", transport=transport)
    assert m.match("x") == []
    assert m.health()["last_error"]["kind"] == "config"


def test_transient_error_stays_retryable_and_recovers():
    m = GroqMatcher(api_key=_VALID_KEY, transport=_http_error(429, "slow down", "Too Many"))
    m.match("x")
    health = m.health()
    assert health["last_error"]["kind"] == "rate_limit"
    assert health["last_error"]["retryable"] is True
    assert health["circuit_permanently_open"] is False

    m._transport = _fake_transport('[{"book":"John","chapter":3,"verse":16}]')
    assert m.match("for God so loved the world")
    recovered = m.health()
    assert recovered["healthy"] is True
    assert recovered["last_error"] is None
    assert recovered["consecutive_failures"] == 0


def test_malformed_response_does_not_crash_the_pipeline():
    def transport(url, headers, body, timeout=20.0):
        return {"unexpected": "shape"}

    m = GroqMatcher(api_key=_VALID_KEY, transport=transport)
    assert m.match("x") == []  # never raises
    assert m.health()["last_error"]["kind"] == "parse"


def test_health_starts_clean():
    m = GroqMatcher(api_key=_VALID_KEY, transport=_fake_transport("[]"))
    health = m.health()
    assert health["healthy"] is False  # nothing proven yet
    assert health["last_error"] is None
    assert health["circuit_open"] is False
