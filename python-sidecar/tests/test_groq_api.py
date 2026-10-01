"""API-level tests for /api/groq (SS-050).

The bug these guard: /status reported {"linked": true} purely because a
non-empty string sat in app.db, while every Stage 3 call was 403ing. Status must
now reflect what the live matcher is actually experiencing.
"""

from __future__ import annotations

import io
import urllib.error

import pytest
from api.groq import router
from engine.config.store import ConfigStore, set_store
from engine.matching import llm_matcher
from engine.matching.groq_matcher import GroqMatcher
from fastapi import FastAPI
from fastapi.testclient import TestClient

_VALID_KEY = "gsk_" + "a1B2c3D4e5F6g7H8i9J0" * 2 + "kLmNoPqR"


@pytest.fixture
def client(tmp_path):
    set_store(ConfigStore(db_path=str(tmp_path / "app.db")))
    llm_matcher.set_matcher(None)
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app)
    set_store(None)
    llm_matcher.set_matcher(None)


def _auth_failing_transport(url, headers, body, timeout=20.0):
    raise urllib.error.HTTPError(
        url, 401, "Unauthorized", {},
        io.BytesIO(b'{"error":{"message":"Invalid API Key","code":"invalid_api_key"}}'),
    )


def test_status_reports_unlinked_when_no_key(client):
    body = client.get("/api/groq/status").json()
    assert body["linked"] is False
    assert body["healthy"] is False
    assert body["key_problem"] == "no Groq API key stored"


def test_placeholder_key_is_never_reported_as_linked(client):
    """The exact production state: enabled + a placeholder key in app.db."""
    client.post("/api/groq/config", json={"api_key": "gsk_fake", "enabled": True})
    body = client.get("/api/groq/status").json()
    assert body["enabled"] is True
    assert body["linked"] is False  # previously reported True
    assert "placeholder" in body["key_problem"] or "malformed" in body["key_problem"]
    assert body["reason"]


def test_status_surfaces_runtime_auth_failure(client):
    client.post("/api/groq/config", json={"api_key": _VALID_KEY, "enabled": True})
    # A key that passes format validation but is rejected at request time.
    assert client.get("/api/groq/status").json()["linked"] is True

    matcher = llm_matcher.active_groq_matcher()
    assert isinstance(matcher, GroqMatcher)
    matcher._transport = _auth_failing_transport
    matcher.match("some sermon sentence")  # degrade one call, as production did

    body = client.get("/api/groq/status").json()
    assert body["linked"] is False
    assert body["healthy"] is False
    assert body["last_error"]["kind"] == "auth"
    assert body["last_error"]["message"] == "Invalid API Key"
    assert body["last_error"]["status"] == 401
    assert body["consecutive_failures"] == 1
    assert body["failures"] == 1
    assert body["circuit_open"] is True
    assert "auth" in body["reason"]


def test_status_reports_healthy_after_a_successful_call(client):
    client.post("/api/groq/config", json={"api_key": _VALID_KEY, "enabled": True})
    matcher = llm_matcher.active_groq_matcher()
    matcher._transport = lambda url, headers, body, timeout=20.0: {
        "choices": [{"message": {"content": "[]"}}]
    }
    matcher.match("a sentence")

    body = client.get("/api/groq/status").json()
    assert body["linked"] is True
    assert body["healthy"] is True
    assert body["last_error"] is None
    assert body["last_success_at"] is not None
    assert body["reason"] is None


def test_config_stores_trimmed_key_and_routes_stage3(client):
    body = client.post(
        "/api/groq/config", json={"api_key": f"  {_VALID_KEY}  ", "enabled": True}
    ).json()
    assert body["active"] is True
    assert body["key_problem"] is None  # whitespace would otherwise fail validation
    assert isinstance(llm_matcher.get_matcher(), GroqMatcher)


def test_disabling_unroutes_stage3(client):
    client.post("/api/groq/config", json={"api_key": _VALID_KEY, "enabled": True})
    body = client.post("/api/groq/config", json={"enabled": False}).json()
    assert body["enabled"] is False
    assert body["linked"] is False
    assert body["active"] is False
    assert llm_matcher.active_groq_matcher() is None


def test_test_endpoint_requires_a_key(client):
    assert client.post("/api/groq/test", json={}).status_code == 400
