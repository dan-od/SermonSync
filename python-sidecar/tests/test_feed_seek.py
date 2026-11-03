"""Test-feed seek bar backend (SS-072): seeking the file source, flushing the
pipeline on a seek, recording and scoring a seeked run, caption markers."""

from __future__ import annotations

import asyncio
import json
import shutil
import wave

import numpy as np
import pytest
from engine.audio import file_source as fs
from engine.eval import captions as cap
from engine.eval import source_info

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")

SERMON_VTT = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:04.000
Good morning church, please be seated

00:00:04.000 --> 00:00:08.000
open your Bibles and turn with me to John

00:00:08.000 --> 00:00:12.000
three sixteen, for God so loved the world

00:00:20.000 --> 00:00:24.000
and in Romans eight twenty eight we know
"""

AUTO_SPLIT_VTT = """WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:03.000 align:start position:0%
\x20
turn<00:00:01.400><c> to</c><00:00:01.800><c> Isaiah</c>

00:00:03.000 --> 00:00:05.000 align:start position:0%
turn to Isaiah
fifty-three<00:00:03.500><c> five</c><00:00:04.000><c> he</c><00:00:04.200><c> was</c>
"""


def _write_wav(path, seconds=3.0, rate=48000, bursts=False):
    t = np.arange(int(seconds * rate)) / rate
    audio = (0.3 * np.sin(2 * np.pi * 300 * t)).astype("float32")
    if bursts:  # 0.5 s tone, 0.5 s silence, … -> utterances for the energy VAD
        audio[(t % 1.0) >= 0.5] = 0.0
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((audio * 32767).astype("<i2").tobytes())
    return path


# --- file source -----------------------------------------------------------


@needs_ffmpeg
def test_seek_jumps_and_reports_position(tmp_path):
    wav = _write_wav(tmp_path / "tone.wav", seconds=3.0)
    positions, seeks = [], []
    src = fs.FileAudioSource(
        str(wav), None, speed=50.0, on_seek=lambda old, new: seeks.append((old, new))
    )

    def frame(samples, rate):
        positions.append(src.position)
        if len(positions) == 11:  # while frame 10 (t = 0.20 s) is processed
            src.seek(2.0)

    src.process_frame = frame
    src.start_thread()
    src.join(10)
    assert src.finish_reason == "ended"
    assert positions[10] == pytest.approx(0.20)
    assert positions[11] == pytest.approx(2.0)  # the very next frame is at the target
    assert seeks == [(pytest.approx(0.22), 2.0)]
    assert src.seeks == 1
    assert src.position == pytest.approx(3.0)
    assert src.frames_processed == 11 + 50


@needs_ffmpeg
def test_seek_keeps_the_window_end(tmp_path):
    wav = _write_wav(tmp_path / "tone.wav", seconds=3.0)
    positions = []
    src = fs.FileAudioSource(str(wav), None, start=0.0, duration=1.0, speed=50.0)

    def frame(samples, rate):
        positions.append(src.position)
        if len(positions) == 1:
            src.seek(0.6)

    src.process_frame = frame
    src.start_thread()
    src.join(10)
    assert positions[1] == pytest.approx(0.6)
    assert src.position == pytest.approx(1.0)  # still stops at start + duration


# --- pipeline flush --------------------------------------------------------


def test_reset_stream_state_flushes_buffers_and_stage0():
    from engine.eval.feed import reset_stream_state
    from engine.matching.orchestrator import get_orchestrator
    from engine.transcription.buffer import transcript_buffer
    from engine.transcription.streaming import streaming_transcriber as st

    st._buf.extend(b"\x01\x00" * 16000)
    transcript_buffer.add_fragment("and the Lord said unto", is_final=True, timestamp=100.0)
    spoken = get_orchestrator()._spoken_m()
    assert spoken.feed("Open your Bibles to John three", 100.0) == []
    epoch = st._epoch

    reset_stream_state()

    assert len(st._buf) == 0
    assert st._buf_offset == st.fed_bytes
    assert st._epoch == epoch + 1
    assert transcript_buffer._buffer == ""
    assert transcript_buffer.context == [] or len(transcript_buffer.context) == 0
    # "sixteen" after the jump must not complete the "John three" from before it.
    assert spoken.feed("sixteen. For God so loved the world", 101.0) == []


def test_inference_overtaken_by_a_seek_is_discarded(monkeypatch):
    from engine.transcription import streaming, whisper_engine
    from engine.transcription.buffer import transcript_buffer

    st = streaming.StreamingTranscriber(matching_enabled=False)
    sent = []

    class SeekDuringInference:
        def transcribe(self, audio, language=None, **_):
            st.reset()  # the seek lands while Whisper is busy
            return [{"text": "before the jump", "confidence": 0.9, "start": 0, "end": 1}]

    async def broadcast(payload):
        sent.append(payload)

    monkeypatch.setattr(whisper_engine, "get_engine", lambda: SeekDuringInference())
    monkeypatch.setattr(streaming.manager, "broadcast_json", broadcast)
    transcript_buffer.reset()
    asyncio.run(st._infer_and_emit(b"\x00\x00" * 32000, received_ts=0.0, seq=1))
    assert sent == []
    assert transcript_buffer._buffer == ""


# --- controller + recorder + scoring ----------------------------------------


@needs_ffmpeg
def test_controller_seek_is_recorded_and_scored(tmp_path, monkeypatch):
    from engine.audio import vad
    from engine.audio.capture import capture_manager
    from engine.eval import feed as feed_mod
    from engine.transcription import whisper_engine
    from engine.transcription.streaming import streaming_transcriber

    wav = _write_wav(tmp_path / "clip.wav", seconds=8.0, bursts=True)
    monkeypatch.setattr(feed_mod, "RUNS_DIR", tmp_path / "runs")
    monkeypatch.setattr(feed_mod, "DRAIN_TIMEOUT_SECONDS", 3.0)
    whisper_engine.set_engine(whisper_engine.MockWhisperEngine())
    vad.set_detector(vad.EnergyVAD(sensitivity=0.5))
    monkeypatch.setattr(streaming_transcriber, "matching_enabled", False)
    sink_before = capture_manager.speech_sink
    capture_manager.speech_sink = streaming_transcriber.feed
    controller = feed_mod.FeedController()
    controller.warm_matcher = False
    seen: dict = {}

    async def run():
        await controller.start(str(wav), speed=4.0, label="seek clip", score=False)
        for _ in range(200):
            if controller.state == "playing" and controller.position() >= 1.0:
                break
            await asyncio.sleep(0.02)
        seen["status"] = await controller.seek(6.0)
        await controller.wait()
        await streaming_transcriber.stop()

    try:
        asyncio.run(run())
    finally:
        capture_manager.speech_sink = sink_before
        whisper_engine.set_engine(None)
        vad.set_detector(None)

    assert controller.state == "stopped", controller.error
    status = seen["status"]
    assert status["position"] == pytest.approx(6.0, abs=0.1)
    assert status["last_seek"]["to"] == 6.0
    jumped_from = status["last_seek"]["from"]
    assert 1.0 <= jumped_from < 3.0

    events = [json.loads(x) for x in (controller.run_dir / "events.jsonl").read_text().splitlines()]
    (seek,) = [e for e in events if e["type"] == "seek"]
    assert seek["to"] == 6.0 and seek["t"] == seek["from"] == pytest.approx(jumped_from, abs=0.01)
    end = events[-1]
    assert end["type"] == "run_end" and end["seeks"] == 1
    assert end["end_position"] == pytest.approx(8.0, abs=0.05)
    # No chunk spans the skipped audio.
    for c in (e for e in events if e["type"] == "chunk"):
        for a, b in c["intervals"]:
            assert b <= jumped_from + 0.05 or a >= 6.0 - 0.35  # pre-roll may reach back

    jiwer = pytest.importorskip("jiwer")  # noqa: F841
    from engine.eval import scoring

    run = scoring.load_run(controller.run_dir)
    assert run.played == [
        [0.0, pytest.approx(jumped_from, abs=0.01)],
        [6.0, pytest.approx(8.0, abs=0.05)],
    ]
    assert run.duration == pytest.approx(jumped_from + 2.0, abs=0.1)


def _seeked_run(tmp_path):
    """Played 0–8 s, jumped to 20 s, played 20–24 s. 8–20 s never heard."""
    run = tmp_path / "run"
    run.mkdir()
    (run / "captions.vtt").write_text(SERMON_VTT)
    meta = {
        "request": {"source": "x", "start": 0.0, "duration": None, "speed": 1.0, "label": "s"},
        "source": {"title": "S", "captions_kind": "human", "source_id": "s"},
        "captions_file": "captions.vtt",
        "engine": {"loaded_model": "base", "device": "cpu", "compute_type": "int8"},
    }
    (run / "meta.json").write_text(json.dumps(meta))

    def ev(kind, t, **f):
        return {"type": kind, "t": t, "rt": t, **f}

    events = [
        ev("run_start", 0.0, meta=meta),
        ev("frame_state", 0.0, is_speech=True, scene="speech", forward=True),
        ev("chunk", 4.5, seq=1, reason="pause", duration=4.0, intervals=[[0.0, 4.0]]),
        ev("inference", 5.0, seq=1, segments=[{"text": "Good morning church, please be seated"}]),
        ev("seek", 8.0, **{"from": 8.0, "to": 20.0}),
        # Overtaken by the seek: never shown, never scored.
        ev("inference", 20.2, seq=2, discarded="reset", segments=[{"text": "open your Bibles"}]),
        ev("frame_state", 20.0, is_speech=True, scene="speech", forward=True),
        ev("chunk", 24.5, seq=3, reason="pause", duration=4.0, intervals=[[20.0, 24.0]]),
        ev("inference", 25.0, seq=3, segments=[
            {"text": "and in Romans eight twenty eight we know"}]),
        ev("ws", 25.5, event={"type": "suggestions", "results": [
            {"reference": "Romans 8:28", "book": "Romans", "chapter": 8, "verse": 28,
             "stage": 0, "confidence": 0.95}]}),
        ev("run_end", 24.0, frames=600, end_position=24.0, seeks=1),
    ]
    (run / "events.jsonl").write_text("\n".join(json.dumps(e) for e in events) + "\n")
    return run


def test_scoring_skips_audio_that_was_never_played(tmp_path):
    pytest.importorskip("jiwer")
    from engine.eval import scoring

    run_dir = _seeked_run(tmp_path)
    scoring.score_run_dir(run_dir)
    m = json.loads((run_dir / "metrics.json").read_text())
    assert m["run"]["played"] == [[0.0, 8.0], [20.0, 24.0]]
    assert m["run"]["duration_s"] == 12.0
    # 4–8 s ("open your Bibles … John") was played but never transcribed:
    # 9 deletions. 8–20 s (John 3:16) was skipped and is not counted.
    wer = m["wer"]["captions"]
    assert wer["ref_words"] == 6 + 9 + 6  # the normalizer writes "828"
    assert wer["deletions"] == 9 and wer["insertions"] == 0
    # John 3:16 was spoken in the skipped stretch: only Romans 8:28 is expected.
    det = m["detection"]
    assert det["expected"] == 1 and det["found"] == 1
    # VAD was open over everything played.
    assert m["vad"]["vad_open_s"] == pytest.approx(12.0)
    assert "Seeked 1×" in (run_dir / "report.md").read_text()


# --- caption markers -------------------------------------------------------


def test_markers_from_captions(tmp_path):
    path = tmp_path / "sermon.vtt"
    path.write_text(SERMON_VTT)
    captions = cap.parse_vtt(path)
    markers = source_info.caption_markers(captions)
    assert [m["reference"] for m in markers] == ["John 3:16", "Romans 8:28"]
    john, romans = markers
    # At "John" (the last word of the 4–8 s line), with both lines of text.
    assert 7.0 <= john["time"] < 8.0
    assert john["caption_text"] == (
        "open your Bibles and turn with me to John three sixteen, for God so loved the world"
    )
    assert 20.0 <= romans["time"] < 22.0
    assert romans["caption_text"] == "and in Romans eight twenty eight we know"


def test_markers_from_auto_captions_split_across_lines(tmp_path):
    path = tmp_path / "auto.vtt"
    path.write_text(AUTO_SPLIT_VTT)
    (marker,) = source_info.caption_markers(cap.parse_vtt(path))
    assert marker["reference"] == "Isaiah 53:5"
    assert marker["time"] == pytest.approx(1.8)  # "Isaiah"
    assert "Isaiah" in marker["caption_text"] and "five" in marker["caption_text"]


@needs_ffmpeg
def test_prepare_describes_source(tmp_path):
    from engine.eval.feed import FeedController

    wav = _write_wav(tmp_path / "Sunday.wav", seconds=2.0)
    (tmp_path / "Sunday.vtt").write_text(SERMON_VTT)
    info = asyncio.run(FeedController().prepare(str(wav)))
    assert info["title"] == "Sunday"
    assert info["duration"] == pytest.approx(2.0, abs=0.01)
    assert info["captions"] == "file"
    assert info["cues"][0] == {
        "start": 0.0, "end": 4.0, "text": "Good morning church, please be seated"
    }
    assert [m["reference"] for m in info["markers"]] == ["John 3:16", "Romans 8:28"]


def test_backward_seek_scores_in_source_order(tmp_path):
    """Played 20–24 s, then jumped back to 0 and played 0–4 s: the transcript
    is compared with the captions in source order, not play order."""
    pytest.importorskip("jiwer")
    from engine.eval import scoring

    run = tmp_path / "run"
    run.mkdir()
    (run / "captions.vtt").write_text(SERMON_VTT)
    meta = {
        "request": {"source": "x", "start": 20.0, "duration": None, "speed": 1.0, "label": "b"},
        "source": {"title": "B", "captions_kind": "human", "source_id": "b"},
        "captions_file": "captions.vtt",
        "engine": {},
    }
    (run / "meta.json").write_text(json.dumps(meta))

    def ev(kind, t, **f):
        return {"type": kind, "t": t, "rt": 0, **f}

    events = [
        ev("run_start", 20.0, meta=meta),
        ev("chunk", 24.5, seq=1, reason="pause", duration=4.0, intervals=[[20.0, 24.0]]),
        ev("inference", 25.0, seq=1, segments=[
            {"text": "and in Romans eight twenty eight we know"}]),
        ev("seek", 25.0, **{"from": 25.0, "to": 0.0}),
        ev("chunk", 4.5, seq=2, reason="pause", duration=4.0, intervals=[[0.0, 4.0]]),
        ev("inference", 5.0, seq=2, segments=[{"text": "Good morning church, please be seated"}]),
        ev("run_end", 4.0, end_position=4.0, seeks=1),
    ]
    (run / "events.jsonl").write_text("\n".join(json.dumps(e) for e in events) + "\n")
    scoring.score_run_dir(run)
    m = json.loads((run / "metrics.json").read_text())
    assert m["run"]["window"] == [0.0, 25.0]
    assert m["run"]["played"] == [[20.0, 25.0], [0.0, 4.0]]
    assert m["wer"]["captions"]["wer"] == 0.0


# --- SS-075: detected-reference markers and the seek request -------------
def test_suggestions_during_a_feed_become_markers():
    from engine.eval import feed as feed_mod

    controller = feed_mod.FeedController()
    suggestions = {
        "type": "suggestions",
        "sentence": "John 3:16",
        "results": [{"reference": "John 3:16", "confidence": 0.991, "book": "John"}],
    }
    controller._on_broadcast(suggestions)  # idle: not a feed run
    assert controller.status()["markers"] == []

    controller.state = "playing"
    controller.position = lambda: 42.257
    controller._on_broadcast({"type": "transcription", "text": "John 3:16"})
    controller._on_broadcast(suggestions)
    assert controller.status()["markers"] == [
        {"time": 42.26, "reference": "John 3:16", "confidence": 0.991}
    ]


def test_seek_request_accepts_position_and_position_seconds():
    from api.dev_feed import SeekRequest
    from pydantic import ValidationError

    assert SeekRequest.model_validate({"position": 30}).position == 30
    assert SeekRequest.model_validate({"position_seconds": 12.5}).position == 12.5
    with pytest.raises(ValidationError):
        SeekRequest.model_validate({"position": -1})


def test_seek_route_passes_the_position(monkeypatch):
    from api import dev_feed

    seen = []

    async def fake_seek(position):
        seen.append(position)
        return {"type": "test_feed", "position": position}

    monkeypatch.setattr(dev_feed.test_feed, "seek", fake_seek)
    out = asyncio.run(dev_feed.post_test_feed_seek(dev_feed.SeekRequest(position=30)))
    assert seen == [30] and out["position"] == 30
