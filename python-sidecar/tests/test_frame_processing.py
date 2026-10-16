"""The PortAudio callback and the eval file source share one frame path (SS-072)."""

from __future__ import annotations

import numpy as np
import pytest
from engine.audio import capture, vad, worship_detector
from engine.audio.state import audio_state
from engine.eval import tap


class _ScriptedVAD:
    """Returns a fixed speech/silence sequence, one decision per frame."""

    def __init__(self, decisions):
        self.decisions = list(decisions)
        self.calls = []

    def process(self, samples):
        self.calls.append(np.asarray(samples).shape)
        return self.decisions.pop(0), 0.9

    def reset(self):
        pass


class _Recorder:
    def __init__(self):
        self.events = []

    def record(self, kind, fields):
        self.events.append((kind, fields))


@pytest.fixture
def manager(monkeypatch):
    mgr = capture.CaptureManager()
    sent = []
    mgr.speech_sink = sent.append
    mgr.sent = sent
    monkeypatch.setattr(worship_detector, "_detector", worship_detector.WorshipDetector())
    yield mgr
    vad.set_detector(None)
    tap.uninstall()


def _frames(n, rate=48000, channels=1, seed=0):
    rng = np.random.default_rng(seed)
    size = round(rate * 0.02)
    shape = (size, channels)
    return [(rng.standard_normal(shape) * 0.05).astype("float32") for _ in range(n)]


def test_callback_and_process_frame_forward_identical_audio(manager):
    decisions = [False, False, False, True, True, False, False, True]
    frames = _frames(len(decisions))
    audio_state.sample_rate = 48000

    vad.set_detector(_ScriptedVAD(decisions))
    for frame in frames:
        manager._on_audio(frame, len(frame), None, None)
    via_callback = list(manager.sent)

    other = capture.CaptureManager()
    other.speech_sink = []
    sent = []
    other.speech_sink = sent.append
    vad.set_detector(_ScriptedVAD(decisions))
    worship_detector._detector.reset()
    for frame in frames:
        other.process_frame(frame.copy(), 48000)

    assert via_callback == sent
    assert len(sent) > 0


def test_rising_edge_replays_preroll(manager):
    decisions = [False, False, False, True]
    frames = _frames(4)
    vad.set_detector(_ScriptedVAD(decisions))
    for frame in frames:
        manager.process_frame(frame, 48000)
    # 3 pre-roll frames replayed, then the current frame.
    assert len(manager.sent) == 4
    expected = [
        capture.float_to_pcm16(capture.resample_to_transcription_rate(f, 48000)) for f in frames
    ]
    assert manager.sent == expected


def test_resamples_device_rate_to_16k_mono(manager):
    vad.set_detector(_ScriptedVAD([True]))
    manager.process_frame(_frames(1, rate=48000, channels=2)[0], 48000)
    # 20 ms at 16 kHz mono = 320 samples = 640 bytes.
    assert len(manager.sent[0]) == 640


def test_worship_scene_blocks_forwarding(manager, monkeypatch):
    def always_worship(rms, flatness=None):
        return worship_detector.WORSHIP, 0.9

    monkeypatch.setattr(worship_detector._detector, "update", always_worship)
    vad.set_detector(_ScriptedVAD([True, True]))
    for frame in _frames(2):
        manager.process_frame(frame, 48000)
    assert manager.sent == []


def test_tap_reports_frames_and_sink_calls_only_when_installed(manager):
    vad.set_detector(_ScriptedVAD([False, True, False]))
    frames = _frames(3)
    manager.process_frame(frames[0], 48000)  # no recorder: nothing recorded
    rec = _Recorder()
    tap.install(rec)
    manager.process_frame(frames[1], 48000)
    manager.process_frame(frames[2], 48000)
    kinds = [k for k, _ in rec.events]
    assert kinds.count("frame") == 2
    sinks = [f for k, f in rec.events if k == "sink"]
    # Rising edge: one pre-roll frame (1 back) then the current frame (0 back).
    assert [s["back"] for s in sinks] == [1, 0]
    assert rec.events[0][1]["forward"] is True


def test_reset_frame_state_clears_preroll(manager):
    vad.set_detector(_ScriptedVAD([False, False, True]))
    frames = _frames(3)
    manager.process_frame(frames[0], 48000)
    manager.process_frame(frames[1], 48000)
    manager.reset_frame_state()
    manager.process_frame(frames[2], 48000)
    assert len(manager.sent) == 1
