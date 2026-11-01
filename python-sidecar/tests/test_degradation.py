"""Graceful-degradation tests (SS-055).

Verify each documented failure mode degrades without crashing the pipeline.
"""

from __future__ import annotations

import asyncio
import ctypes
import sys
import types
import urllib.error

import numpy as np
import pytest


def test_health_reports_components():
    from engine.health import system_health

    h = system_health()
    assert h["status"] in ("ok", "degraded")
    for key in ("audio", "transcription", "matching", "websocket"):
        assert key in h["components"]


@pytest.fixture
def whisper_engine(monkeypatch):
    """The engine module, unloaded, with a fixed model."""
    from engine.transcription import whisper_engine as module

    monkeypatch.setenv("WHISPER_MODEL", "base")
    module.set_engine(None)
    yield module
    module.set_engine(None)


def _as_production(monkeypatch) -> None:
    # In the test body: pytest sets PYTEST_CURRENT_TEST again before each phase.
    monkeypatch.delenv("SERMONSYNC_TEST", raising=False)
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)


def _fail_all_loads(monkeypatch, whisper_engine) -> list:
    calls = []

    def _boom(cls, candidates=None):
        calls.append(cls)
        raise RuntimeError("no model")

    monkeypatch.setattr(whisper_engine.FasterWhisperEngine, "load", classmethod(_boom))
    monkeypatch.setattr(whisper_engine.MLXWhisperEngine, "load", classmethod(_boom))
    return calls


def _fake_faster_whisper(monkeypatch, fail_devices=()) -> list:
    loads = []

    class WhisperModel:
        def __init__(self, size, device, compute_type, **kwargs):
            if device in fail_devices:
                raise RuntimeError(f"{device} unavailable")
            loads.append((size, device, compute_type))

    monkeypatch.setitem(
        sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=WhisperModel)
    )
    return loads


@pytest.mark.parametrize("env", ["SERMONSYNC_TEST", "PYTEST_CURRENT_TEST"])
def test_whisper_load_failure_uses_mock_only_in_tests(monkeypatch, whisper_engine, env):
    _fail_all_loads(monkeypatch, whisper_engine)
    _as_production(monkeypatch)
    monkeypatch.setenv(env, "1")
    engine = whisper_engine.get_engine()
    assert getattr(engine, "is_mock", False) is True
    assert engine.transcribe(np.zeros(16000, dtype="float32"))


def test_whisper_load_failure_never_serves_mock_in_production(monkeypatch, whisper_engine):
    """No fake transcripts in a live service; the failure is not retried per chunk."""
    calls = _fail_all_loads(monkeypatch, whisper_engine)
    _as_production(monkeypatch)
    with pytest.raises(RuntimeError, match="no model"):
        whisper_engine.get_engine()
    loads_after_first = len(calls)
    with pytest.raises(RuntimeError, match="no model"):
        whisper_engine.get_engine()
    assert len(calls) == loads_after_first
    from api.engine import engine_status

    assert "no model" in engine_status()["transcription"]["load_error"]


def test_missing_cuda_dlls_on_windows_runs_on_cpu(monkeypatch, caplog, whisper_engine):
    """No GPU stack on Windows means CPU faster-whisper, not MockWhisperEngine."""
    loads = _fake_faster_whisper(monkeypatch)
    _as_production(monkeypatch)

    def _missing_dll(name):
        raise OSError(f"{name} not found")

    monkeypatch.setattr(ctypes, "WinDLL", _missing_dll, raising=False)
    monkeypatch.setattr(sys, "platform", "win32")
    engine = whisper_engine.get_engine()
    monkeypatch.undo()

    assert isinstance(engine, whisper_engine.FasterWhisperEngine)
    assert not engine.is_mock
    assert (engine.device, engine.compute_type) == ("cpu", "int8")
    assert loads == [("base", "cpu", "int8")]
    assert "No CUDA found — running Whisper on CPU (slower but functional)" in caplog.text


def test_cuda_load_failure_retries_on_cpu(monkeypatch, whisper_engine):
    _fake_faster_whisper(monkeypatch, fail_devices=("cuda",))
    _as_production(monkeypatch)
    monkeypatch.setattr(
        whisper_engine, "_pick_device_faster_whisper", lambda: ("cuda", "float16")
    )
    engine = whisper_engine.get_engine()
    assert (engine.device, engine.model_size) == ("cpu", "base")
    assert engine.degraded is False


def test_streaming_survives_having_no_engine(monkeypatch, whisper_engine):
    """No engine stops transcription, not capture or the sidecar."""
    from engine.transcription.streaming import StreamingTranscriber

    _fail_all_loads(monkeypatch, whisper_engine)
    _as_production(monkeypatch)
    transcriber = StreamingTranscriber()

    async def run():
        await transcriber.start()
        pcm = b"\x00\x00" * 16000
        await transcriber._infer_and_emit(pcm, 0.0)
        await transcriber._emit_partial(pcm)
        await transcriber.stop()

    asyncio.run(run())


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
