"""File audio source + test-feed controller (SS-072). No network: a generated WAV."""

from __future__ import annotations

import asyncio
import json
import shutil
import time
import wave

import numpy as np
import pytest
from engine.audio import file_source as fs

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def _write_wav(path, seconds=1.0, rate=44100, channels=2, freq=440.0):
    t = np.arange(int(seconds * rate)) / rate
    tone = (0.3 * np.sin(2 * np.pi * freq * t)).astype("float32")
    data = np.repeat(tone[:, None], channels, axis=1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((data * 32767).astype("<i2").tobytes())
    return path


def test_prepare_local_file_finds_sidecar_captions(tmp_path):
    wav = _write_wav(tmp_path / "Sunday Sermon.wav")
    (tmp_path / "Sunday Sermon.vtt").write_text("WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n")
    prepared = fs.prepare_source(str(wav))
    assert prepared.title == "Sunday Sermon"
    assert prepared.source_id == "sunday-sermon"
    assert prepared.captions_kind == "file"
    assert prepared.media_duration == pytest.approx(1.0, abs=0.01)


def test_prepare_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        fs.prepare_source(str(tmp_path / "nope.wav"))


def test_streams_48k_mono_20ms_frames(tmp_path):
    wav = _write_wav(tmp_path / "tone.wav", seconds=1.0)
    got = []
    src = fs.FileAudioSource(str(wav), lambda s, r: got.append((s, r)), speed=50.0)
    src.start_thread()
    src.join(10)
    assert src.finish_reason == "ended"
    assert len(got) == 50
    samples, rate = got[0]
    assert rate == 48000
    assert samples.shape == (960, 1)
    assert samples.dtype == np.float32
    peak = float(np.max(np.abs(np.concatenate([s for s, _ in got]))))
    assert peak == pytest.approx(0.3, abs=0.02)  # channels averaged, not summed
    assert src.position == pytest.approx(1.0)


def test_start_duration_and_position(tmp_path):
    wav = _write_wav(tmp_path / "tone.wav", seconds=2.0)
    positions = []
    src = fs.FileAudioSource(str(wav), lambda s, r: None, start=0.5, duration=0.4, speed=50.0)
    src.process_frame = lambda s, r: positions.append(src.position)
    src.start_thread()
    src.join(10)
    assert len(positions) == 20
    assert positions[0] == pytest.approx(0.5)
    assert positions[-1] == pytest.approx(0.88)


def test_realtime_pacing(tmp_path):
    wav = _write_wav(tmp_path / "tone.wav", seconds=0.4)
    src = fs.FileAudioSource(str(wav), lambda s, r: None, speed=1.0)
    t0 = time.perf_counter()
    src.start_thread()
    src.join(10)
    assert time.perf_counter() - t0 >= 0.35


def test_stop_ends_early(tmp_path):
    wav = _write_wav(tmp_path / "tone.wav", seconds=5.0)
    src = fs.FileAudioSource(str(wav), lambda s, r: None, speed=1.0)
    src.start_thread()
    src.stop()
    src.join(5)
    assert src.finish_reason == "stopped"
    assert src.frames_processed < 250


def test_feed_controller_records_a_run(tmp_path, monkeypatch):
    """A generated clip runs through the real capture → transcriber path and
    lands in events.jsonl (mock Whisper, energy VAD, matching off)."""
    from engine.audio import vad
    from engine.audio.capture import capture_manager
    from engine.eval import feed as feed_mod
    from engine.transcription import whisper_engine
    from engine.transcription.streaming import streaming_transcriber

    wav = tmp_path / "clip.wav"
    # Tone bursts separated by silence -> several utterances.
    rate = 48000
    t = np.arange(rate) / rate
    burst = (0.3 * np.sin(2 * np.pi * 300 * t[: rate // 2])).astype("float32")
    silence = np.zeros(rate, dtype="float32")
    audio = np.concatenate([burst, silence, burst, silence])
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((audio * 32767).astype("<i2").tobytes())

    monkeypatch.setattr(feed_mod, "RUNS_DIR", tmp_path / "runs")
    whisper_engine.set_engine(whisper_engine.MockWhisperEngine())
    vad.set_detector(vad.EnergyVAD(sensitivity=0.5))
    monkeypatch.setattr(streaming_transcriber, "matching_enabled", False)
    sink_before = capture_manager.speech_sink
    capture_manager.speech_sink = streaming_transcriber.feed
    controller = feed_mod.FeedController()
    controller.warm_matcher = False
    monkeypatch.setattr(feed_mod, "DRAIN_TIMEOUT_SECONDS", 3.0)

    async def run():
        await controller.start(str(wav), speed=1.0, label="unit clip", score=False)
        await controller.wait()
        await streaming_transcriber.stop()

    try:
        asyncio.run(run())
    finally:
        capture_manager.speech_sink = sink_before
        whisper_engine.set_engine(None)
        vad.set_detector(None)

    assert controller.state == "stopped", controller.error
    events = [json.loads(x) for x in (controller.run_dir / "events.jsonl").read_text().splitlines()]
    kinds = {e["type"] for e in events}
    assert {"run_start", "frame_state", "chunk", "inference", "run_end"} <= kinds
    chunks = [e for e in events if e["type"] == "chunk"]
    # Each chunk maps back onto the source audio it came from.
    assert all(c["intervals"] for c in chunks)
    assert chunks[0]["audio_start"] < 0.6
    meta = json.loads((controller.run_dir / "meta.json").read_text())
    assert meta["request"]["label"] == "unit clip"
    assert meta["engine"]["is_mock"] is True
