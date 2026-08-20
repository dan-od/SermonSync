"""Graceful-degradation tests (SS-055).

Verify each documented failure mode degrades without crashing the pipeline.
"""

from __future__ import annotations

import asyncio
import urllib.error

import pytest


def test_health_reports_components():
    from engine.health import system_health

    h = system_health()
    assert h["status"] in ("ok", "degraded")
    for key in ("audio", "transcription", "matching", "websocket"):
        assert key in h["components"]


def test_whisper_load_failure_falls_back_to_mock(monkeypatch):
    """If no real model loads, get_engine() returns the mock, never raises."""
    from engine.transcription import whisper_engine

    whisper_engine.set_engine(None)
    monkeypatch.setattr(
        whisper_engine.WhisperEngine, "load",
        classmethod(lambda cls, candidates=None: (_ for _ in ()).throw(RuntimeError("no model"))),
    )
    engine = whisper_engine.get_engine()
    assert getattr(engine, "is_mock", False) is True
    # still transcribes (dummy) without raising
    import numpy as np
    assert engine.transcribe(np.zeros(16000, dtype="float32"))
    whisper_engine.set_engine(None)


def test_groq_api_error_degrades_to_empty():
    """A Groq network error returns [] so the cascade falls through (never crashes)."""
    from engine.matching.groq_matcher import GroqMatcher

    def boom(url, headers, body, timeout=20.0):
        raise urllib.error.URLError("down")

    assert GroqMatcher(api_key="k", transport=boom).match("anything") == []


def test_websocket_drop_does_not_raise():
    """A client that errors on send is dropped, broadcast still succeeds."""
    from ws_hub import ConnectionManager

    class DeadWS:
        async def send_json(self, payload):
            raise RuntimeError("connection closed")

    mgr = ConnectionManager()
    mgr._clients.add(DeadWS())  # simulate a live-but-dead client

    asyncio.run(mgr.broadcast_json({"type": "x"}))  # must not raise
    assert mgr.client_count == 0  # dead client pruned


def test_audio_backend_unavailable_raises_typed_error(monkeypatch):
    """No PortAudio -> typed AudioBackendError (surfaced as 503), not a crash."""
    from engine.audio import devices

    monkeypatch.setattr(devices, "_sd", None)
    assert devices.backend_available() is False
    with pytest.raises(devices.AudioBackendError):
        devices.list_input_devices()
