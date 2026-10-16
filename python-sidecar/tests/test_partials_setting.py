"""Interim-transcription setting (E): main / off / small model."""

from __future__ import annotations

import asyncio

import pytest
from engine.transcription import streaming, whisper_engine
from engine.transcription.streaming import StreamingTranscriber


def test_off_disables_partials():
    st = StreamingTranscriber()
    st._buf.extend(b"\x00\x00" * 32000)  # 2 s buffered
    assert st._ready_for_partial(now=10.0)
    st.set_partial_mode("off")
    assert not st._ready_for_partial(now=10.0)


def test_rejects_unknown_mode():
    with pytest.raises(ValueError):
        StreamingTranscriber().set_partial_mode("large-v3")


def test_small_model_runs_partials_and_main_runs_finals(monkeypatch):
    used = []

    class Eng:
        def __init__(self, name):
            self.name = name

        def transcribe(self, audio, language=None, **kw):
            used.append(self.name)
            return [{"text": "hi", "confidence": 1.0, "no_speech_prob": 0.0, "start": 0, "end": 1}]

    async def drop(payload):
        return None

    monkeypatch.setattr(streaming.manager, "broadcast_json", drop)
    monkeypatch.setattr(whisper_engine, "_partial_engines", {"tiny.en": Eng("tiny")})
    whisper_engine.set_engine(Eng("main"))
    try:
        st = StreamingTranscriber(matching_enabled=False)
        st.set_partial_mode("tiny.en")
        asyncio.run(st._emit_partial(b"\x00\x00" * 16000))
        asyncio.run(st._infer_and_emit(b"\x00\x00" * 16000, 0.0, 1))
    finally:
        whisper_engine.set_engine(None)
    assert used == ["tiny", "main"]


def test_setting_endpoint_persists(monkeypatch):
    from api import transcription as api

    stored = {}

    class Store:
        def set_setting(self, k, v):
            stored[k] = v

        def get_setting(self, k, default=None):
            return stored.get(k, default)

    monkeypatch.setattr(api, "get_store", lambda: Store())
    try:
        assert api.set_partials(api.PartialsRequest(mode="off")) == {"partials": "off"}
        assert stored == {"transcription_partials": "off"}
        api.streaming_transcriber.set_partial_mode("main")
        api.apply_persisted_partials()
        assert api.streaming_transcriber.partial_mode == "off"
    finally:
        api.streaming_transcriber.set_partial_mode("main")
