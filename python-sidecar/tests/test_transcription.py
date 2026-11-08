"""Unit tests for the transcription engine + streaming driver (SS-013)."""

from __future__ import annotations

import asyncio
import time

import numpy as np
from engine.audio import vad
from engine.audio.capture import float_to_pcm16
from engine.transcription import buffer as buffer_mod
from engine.transcription import streaming, whisper_engine
from engine.transcription.buffer import transcript_buffer
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
    # SS-078: at now + 1.1 the silence has run past silence_flush_seconds, so a
    # final is due and the interim stands down. Rate-limiting alone is no
    # longer enough to say yes — check just inside the silence window.
    st.silence_flush_seconds = 2.0
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
    # SS-078 narrowed the gate to the case that still needs it: interims that
    # re-run the *main* model hold the one instance the final needs.
    st.set_partial_mode("main")
    st._running = True
    st.feed(b"\x00\x00" * 16000 * 2)  # 2.0 s buffered
    now = st._last_feed_ts

    st._partial_cost = 0.0        # not yet measured: run and find out
    assert st._ready_for_partial(now=now) is True

    st._partial_cost = 4.5        # a "main"-model pass: 2.0 + 4.5 overruns 6.0
    assert st._ready_for_partial(now=now) is False

    st._partial_cost = 0.3        # a "tiny.en" pass fits in the headroom
    assert st._ready_for_partial(now=now) is True


def test_switching_partial_mode_re_measures_the_cost():
    """SS-077: a cost measured on one partial engine must not gate another.

    Found by measurement: a "main" pass measured ~5.8 s, then switching to
    "tiny.en" kept that figure, and 5.8 s of assumed cost blocks every pass
    under a 6.0 s ceiling — so the cheaper engine never ran once.
    """
    st = streaming.StreamingTranscriber(max_chunk_seconds=6.0, partial_min_seconds=0.8)
    st.set_partial_mode("main")
    st._running = True
    st.feed(b"\x00\x00" * 16000 * 2)  # 2.0 s buffered
    st._partial_cost = 5.8  # as measured on the "main" engine
    assert st._ready_for_partial(now=st._last_feed_ts) is False

    st.set_partial_mode("tiny.en")
    assert st._partial_cost == 0.0
    assert st._ready_for_partial(now=st._last_feed_ts) is True


class _SlowPartialEngine:
    """Main-model stand-in whose decode takes a controllable age."""

    is_mock = True
    backend = "slow-stub"
    device = "cpu"
    compute_type = "n/a"
    model_size = "stub"

    def __init__(self, seconds: float) -> None:
        self.seconds = seconds
        self.calls = 0

    def transcribe(self, audio, language=None, **hints):
        self.calls += 1
        time.sleep(self.seconds)
        return [{
            "text": "interim words", "start": 0.0, "end": 1.0, "confidence": 0.5,
            "no_speech_prob": 0.0, "avg_logprob": -0.5, "compression_ratio": 1.0,
            "language": "en",
        }]


def test_final_is_not_delayed_by_an_in_flight_partial():
    """SS-078: the whole point of Step 1.

    An interim used to be awaited by the poll loop, so a pause that fell while
    one was running could not cut until it finished — two inferences on the
    critical path. The interim now runs detached: the cut happens within a
    poll interval of the pause, whatever the interim is doing.
    """
    slow = _SlowPartialEngine(0.6)
    st = streaming.StreamingTranscriber(
        poll_interval=0.01, partial_min_seconds=0.2, partial_interval=0.0,
        silence_flush_seconds=0.15, min_flush_seconds=0.2, max_chunk_seconds=30.0,
    )
    st.matching_enabled = False
    whisper_engine.set_engine(MockWhisperEngine())
    st._partial_engine = lambda: slow  # interim on its own (slow) instance
    st.set_partial_mode("tiny.en")     # a separate instance: no shared lock

    async def scenario():
        await st.start()
        st.feed(b"\x00\x00" * 16000)   # 1.0 s of speech, then silence
        await asyncio.sleep(0.05)
        assert st._partial_task is not None, "interim should have been launched"
        assert not st._partial_task.done(), "interim should still be running"
        cut_deadline = time.time() + st.silence_flush_seconds + 0.25
        while st._chunk_seq == 0 and time.time() < cut_deadline:
            await asyncio.sleep(0.01)
        cut_at = time.time()
        assert st._chunk_seq == 1, "the final never cut while the interim ran"
        # The interim (0.6 s) must still be in flight: the cut did not wait.
        assert not st._partial_task.done()
        await st.stop()
        return cut_at

    asyncio.run(scenario())


def test_partial_result_landing_after_a_newer_final_is_discarded():
    """SS-078: a detached interim can outlive the audio it describes.

    If a cut happened while it was running, a final now covers that speech,
    and drawing the interim over it would rewind the transcript.
    """
    st = streaming.StreamingTranscriber()
    whisper_engine.set_engine(MockWhisperEngine())
    st._running = True
    before = len(transcript_buffer.partial)

    async def scenario():
        # Launched at seq 3; a cut bumps the counter before it lands.
        st._chunk_seq = 3
        task = asyncio.ensure_future(st._emit_partial(b"\x00\x00" * 16000, 3))
        st._chunk_seq = 4
        await task

    asyncio.run(scenario())
    assert len(transcript_buffer.partial) == before, "superseded interim was shown"


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


def test_default_model_does_not_vary_by_device(monkeypatch):
    """SS-078: measured, then rejected.

    Dropping CPU to "small" hits the latency targets and costs 7.3 points of
    WER and two thirds of Stage 0's recall (eval_runs/20261107-23*), against
    a 2-point regression bar. In spoken_only mode Stage 0 carries the whole
    pipeline's recall, so the faster transcript is not worth the references.
    """
    monkeypatch.delenv("WHISPER_MODEL", raising=False)
    monkeypatch.setattr(whisper_engine, "_accelerated", lambda: False)
    assert whisper_engine._code_default_model() == "large-v3-turbo"
    monkeypatch.setattr(whisper_engine, "_accelerated", lambda: True)
    assert whisper_engine._code_default_model() == "large-v3-turbo"

    # An explicit choice is never second-guessed.
    monkeypatch.setenv("WHISPER_MODEL", "small")
    assert whisper_engine._configured_model() == "small"


def test_latency_warning_needs_evidence_then_names_the_model(monkeypatch):
    """SS-078: warn from a measurement, after warm-up, and never auto-switch."""
    monkeypatch.setattr(whisper_engine, "_rtf_samples", [])
    monkeypatch.setattr(whisper_engine, "_rtf_warned", False)
    # One slow chunk is the model loading, not a slow machine.
    whisper_engine.note_inference(5000.0, 1.0)
    assert whisper_engine.latency_warning() is None
    whisper_engine.note_inference(5000.0, 1.0)
    whisper_engine.note_inference(5000.0, 1.0)
    warning = whisper_engine.latency_warning()
    assert warning is not None and "rtf" in warning
    # On a CPU box the warning names the cheaper model the operator may pick.
    monkeypatch.setattr(whisper_engine, "_accelerated", lambda: False)
    assert "small" in whisper_engine.latency_warning()

    # Keeping up: nothing to say.
    monkeypatch.setattr(whisper_engine, "_rtf_samples", [0.2, 0.2, 0.2])
    assert whisper_engine.latency_warning() is None


def test_sentence_flush_fires_on_a_timer_without_a_new_fragment():
    """SS-078: a trailing phrase must not wait for the speaker to resume."""
    buf = buffer_mod.TranscriptBuffer(silence_gap=2.0)
    t0 = 1000.0
    assert buf.add_fragment("turn with me to John 3 16", is_final=True, timestamp=t0) == []
    # Still inside the gap: nothing yet.
    assert buf.flush_if_idle(t0 + 1.0) == []
    out = buf.flush_if_idle(t0 + 2.5)
    assert [s["text"] for s in out] == ["turn with me to John 3 16"]
    # Nothing left to flush twice.
    assert buf.flush_if_idle(t0 + 9.0) == []


def test_segmentation_defaults():
    """Cut at 6 s, and wait an effective 0.8 s of silence (SS-072 sweep).

    SS-078: the timer is 0.5 s because it does not start when the speaker
    stops — it starts one VAD hangover later, since hangover frames are still
    forwarded and keep _last_feed_ts moving. 0.5 + 0.3 is the 0.8 s the sweep
    found safe, which is what the speaker actually has to leave.
    """
    st = streaming.StreamingTranscriber()
    assert st.silence_flush_seconds == 0.5
    assert st.max_chunk_seconds == 6.0
    assert st.min_flush_seconds == 0.4
    assert st.silence_flush_seconds + vad.EnergyVAD().hangover_ms / 1000 == 0.8
