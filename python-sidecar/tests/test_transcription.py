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
    transcriber = streaming.StreamingTranscriber(sample_rate=16000, max_buffer_seconds=2.0)
    transcriber._running = True
    transcriber.feed(float_to_pcm16(np.zeros(8000, dtype="float32")))
    transcriber._expire_stale_buffer(time.time() + 3.0)

    assert transcriber._buffered_seconds() == 0.0
    assert transcriber._first_chunk_ts is None
    assert transcriber._last_feed_ts is None


def test_streaming_keeps_recent_audio_when_speech_continues():
    transcriber = streaming.StreamingTranscriber(sample_rate=16000)
    transcriber._running = True
    transcriber.feed(float_to_pcm16(np.zeros(8000, dtype="float32")))
    transcriber._first_chunk_ts = time.time() - 10.0
    transcriber._expire_stale_buffer(time.time())

    assert transcriber._buffered_seconds() == 0.5


def test_streaming_emits_transcription(monkeypatch):
    whisper_engine.set_engine(MockWhisperEngine())
    captured = []

    async def fake_broadcast(payload):
        captured.append(payload)

    monkeypatch.setattr(streaming.manager, "broadcast_json", fake_broadcast)

    transcriber = streaming.StreamingTranscriber(
        max_chunk_seconds=1.0, poll_interval=0.05, partial_min_seconds=99
    )

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


def test_utterance_flushes_when_the_speaker_pauses():
    """Cut where the speaker pauses, not on a timer.

    Capture feeds only VAD-passed audio, so the buffer holds gapless speech and
    any timed cut lands mid-word. A pause is the one place a cut is safe.
    """
    st = streaming.StreamingTranscriber(
        max_chunk_seconds=6.0, min_flush_seconds=0.4, silence_flush_seconds=0.45
    )
    st._running = True
    st.feed(b"\x00\x00" * 16000)  # 1.0 s of speech
    now = st._last_feed_ts
    assert st._ready_to_infer(now=now) is False          # speaker still going
    assert st._ready_to_infer(now=now + 0.2) is False    # inter-word gap
    assert st._ready_to_infer(now=now + 0.5) is True     # phrase ended


def test_ceiling_cuts_a_speaker_who_never_pauses():
    st = streaming.StreamingTranscriber(max_chunk_seconds=6.0)
    st._running = True
    st.feed(b"\x00\x00" * 16000 * 6)  # 6 s with no pause at all
    assert st._ready_to_infer(now=st._last_feed_ts) is True


def test_partials_emit_mid_utterance_then_stop_when_drained():
    """Interim hypotheses must appear while the speaker is still talking."""
    st = streaming.StreamingTranscriber(partial_min_seconds=0.8, partial_interval=1.0)
    st._running = True
    st.feed(b"\x00\x00" * 16000)  # 1.0 s buffered, speaker still going
    now = st._last_feed_ts
    assert st._ready_for_partial(now=now) is True
    st._last_partial_ts = now
    assert st._ready_for_partial(now=now + 0.5) is False  # rate-limited
    assert st._ready_for_partial(now=now + 1.1) is True
    st._buf.clear()
    assert st._ready_for_partial(now=now + 5) is False    # nothing buffered


def test_partial_yields_when_it_would_overrun_the_chunk_ceiling():
    """SS-077: a partial pass blocks the poll loop while capture keeps feeding.

    Started with less headroom under max_chunk_seconds than the pass costs, it
    hands back a buffer already past the ceiling, so the next cut is a blind
    mid-word ceiling cut rather than a pause cut. Measured on a 7-minute
    sermon before this gate: 43 of 46 chunks cut at "ceiling", median 9.08 s
    against a 6.0 s ceiling. The pass must yield to the final instead.
    """
    st = streaming.StreamingTranscriber(
        max_chunk_seconds=6.0, partial_min_seconds=0.8, partial_interval=0.6
    )
    st._running = True
    st.feed(b"\x00\x00" * 16000 * 2)  # 2.0 s buffered
    now = st._last_feed_ts

    st._partial_cost = 0.0        # not yet measured: run and find out
    assert st._ready_for_partial(now=now) is True

    st._partial_cost = 4.5        # a "main"-model pass: 2.0 + 4.5 overruns 6.0
    assert st._ready_for_partial(now=now) is False

    st._partial_cost = 0.3        # a "tiny.en" pass fits in the headroom
    assert st._ready_for_partial(now=now) is True


def test_emitting_a_partial_measures_its_own_cost():
    """SS-077: the headroom check is driven by a measured cost, so emitting a
    partial has to record how long it took. Smoothed, so one slow pass (a cold
    partial-model load) cannot silence interims for the rest of the service."""
    whisper_engine.set_engine(MockWhisperEngine())
    st = streaming.StreamingTranscriber()
    st._running = True
    assert st._partial_cost == 0.0

    asyncio.run(st._emit_partial(b"\x00\x00" * 16000))
    assert st._partial_cost > 0.0  # measured on the first pass

    st._partial_cost = 6.0  # pretend the previous pass was slow
    asyncio.run(st._emit_partial(b"\x00\x00" * 16000))
    # Smoothed: pulled towards the fast reading without being replaced by it,
    # so it cannot stick at 6.0 and cannot forget the slow pass either.
    assert 4.2 <= st._partial_cost < 6.0


def test_tiny_buffer_never_flushes():
    st = streaming.StreamingTranscriber(min_flush_seconds=0.4, silence_flush_seconds=0.45)
    st._running = True
    st.feed(b"\x00\x00" * 1600)  # 0.1 s — too short to be worth transcribing
    assert st._ready_to_infer(now=st._last_feed_ts + 5.0) is False


def test_long_buffer_waits_for_a_pause_below_the_ceiling():
    """2 s of continuous speech is NOT a reason to cut — wait for the pause."""
    st = streaming.StreamingTranscriber(max_chunk_seconds=6.0)
    st._running = True
    st.feed(b"\x00\x00" * 32000)  # 2.0 s, speaker still going
    assert st._ready_to_infer(now=st._last_feed_ts) is False


def test_partial_window_is_capped():
    """Interim passes must not re-transcribe the whole buffer every second."""
    st = streaming.StreamingTranscriber(partial_max_seconds=3.0)
    st._running = True
    st.feed(b"\x00\x00" * 16000 * 6)  # 6 s buffered
    tail = int(st.partial_max_seconds * st.sample_rate * 2)
    assert len(bytes(st._buf[-tail:])) / (st.sample_rate * 2) == 3.0


# --- SS-065: status endpoints must not force a model load -----------------
def test_transcription_engine_endpoint_does_not_load_model():
    from api.transcription import engine_info
    from engine.transcription import whisper_engine

    whisper_engine.set_engine(None)
    info = engine_info()
    assert whisper_engine._engine is None      # endpoint did not load anything
    assert info["loaded"] is False
    assert info["loaded_model"] is None
    assert info["model"] == info["configured_model"]  # falls back to configured
    assert "compute_type" in info


def test_engine_status_endpoint_shape():
    from api.engine import engine_status
    from engine.transcription import whisper_engine

    whisper_engine.set_engine(None)
    payload = engine_status()
    assert payload["engine"] == "sermonsync-ai"
    assert payload["version"]
    t = payload["transcription"]
    assert t["backend"] in ("faster-whisper", "mlx-whisper")
    for key in ("configured_model", "loaded_model", "loaded", "device",
                "compute_type", "model_source", "fallback_chain"):
        assert key in t, key


def test_fallback_marks_engine_degraded(monkeypatch):
    """A silent downgrade to a smaller model must be flagged, not swallowed."""
    from engine.transcription import whisper_engine

    attempts = []

    class FakeWhisperModel:
        def __init__(self, size, device=None, compute_type=None):
            attempts.append(size)
            if size != "tiny":
                raise RuntimeError(f"no weights for {size}")

    import sys
    import types

    fake = types.ModuleType("faster_whisper")
    fake.WhisperModel = FakeWhisperModel
    monkeypatch.setitem(sys.modules, "faster_whisper", fake)

    eng = whisper_engine.WhisperEngine.load(["large-v3-turbo", "base", "tiny"])
    assert attempts == ["large-v3-turbo", "base", "tiny"]
    assert eng.model_size == "tiny"
    assert eng.requested_model == "large-v3-turbo"
    assert eng.degraded is True


def test_segmentation_defaults():
    """Picked from the SS-072 sweep: wait 0.8 s of silence, cut at 6 s."""
    st = streaming.StreamingTranscriber()
    assert st.silence_flush_seconds == 0.8
    assert st.max_chunk_seconds == 6.0
    assert st.min_flush_seconds == 0.4
