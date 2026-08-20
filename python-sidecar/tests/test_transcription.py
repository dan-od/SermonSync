"""Unit tests for the transcription engine + streaming driver (SS-013)."""

from __future__ import annotations

import asyncio
import time

import numpy as np
from engine.audio.capture import float_to_pcm16
from engine.transcription import streaming, whisper_engine
from engine.transcription.whisper_engine import MockWhisperEngine


def test_pcm16_roundtrip():
    samples = (np.sin(np.linspace(0, 10, 1600)) * 0.5).astype("float32")
    pcm = float_to_pcm16(samples)
    back = streaming.pcm16_to_float(pcm)
    assert np.allclose(samples, back, atol=1e-3)


def test_mock_engine_returns_text():
    eng = MockWhisperEngine()
    audio = np.zeros(16000, dtype="float32")
    segs = eng.transcribe(audio)
    assert len(segs) == 1
    assert "mock transcription" in segs[0]["text"]
    assert segs[0]["end"] == 1.0


def test_streaming_buffer_keeps_recent_audio_only():
    transcriber = streaming.StreamingTranscriber(
        sample_rate=16000,
        max_buffer_seconds=2.0,
    )
    transcriber._running = True

    transcriber.feed(float_to_pcm16(np.zeros(16000 * 5, dtype="float32")))

    assert transcriber._buffered_seconds() == 2.0


def test_streaming_discards_stale_partial_buffer():
    transcriber = streaming.StreamingTranscriber(sample_rate=16000)
    transcriber._running = True
    transcriber.feed(float_to_pcm16(np.zeros(8000, dtype="float32")))
    transcriber._expire_stale_buffer(time.time() + 3.0)

    assert transcriber._buffered_seconds() == 0.0
    assert transcriber._first_chunk_ts is None


def test_streaming_emits_transcription(monkeypatch):
    whisper_engine.set_engine(MockWhisperEngine())
    captured = []

    async def fake_broadcast(payload):
        captured.append(payload)

    monkeypatch.setattr(streaming.manager, "broadcast_json", fake_broadcast)

    transcriber = streaming.StreamingTranscriber(min_infer_seconds=1.0, poll_interval=0.05)

    async def run():
        await transcriber.start()
        # feed 2 seconds of speech PCM
        pcm = float_to_pcm16(np.full(16000 * 2, 0.1, dtype="float32"))
        transcriber.feed(pcm)
        # let the poll loop pick it up and run (mock) inference
        for _ in range(20):
            await asyncio.sleep(0.05)
            if captured:
                break
        await transcriber.stop()

    asyncio.run(run())
    whisper_engine.set_engine(None)  # reset

    events = [c for c in captured if c.get("type") == "transcription"]
    assert events, "expected a transcription event"
    assert events[0]["is_final"] is True
    assert "latency_ms" in events[0]
