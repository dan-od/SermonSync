"""Unit tests for PCM capture helpers and lifecycle (SS-009).

DSP helpers are tested directly; the capture lifecycle mocks the sounddevice
InputStream so it runs without hardware.
"""

from __future__ import annotations

import asyncio
import struct

import numpy as np
import pytest
from engine.audio import capture
from engine.audio.state import audio_state


def test_compute_levels_constant():
    rms, peak = capture.compute_levels(np.full(480, 0.5, dtype="float32"))
    assert rms == pytest.approx(0.5, abs=1e-4)
    assert peak == pytest.approx(0.5, abs=1e-4)


def test_compute_levels_silence():
    assert capture.compute_levels(np.zeros(480, dtype="float32")) == (0.0, 0.0)


def test_compute_levels_empty():
    assert capture.compute_levels(np.zeros(0, dtype="float32")) == (0.0, 0.0)


def test_float_to_pcm16_range_and_length():
    samples = np.array([0.0, 1.0, -1.0, 2.0, -2.0], dtype="float32")
    pcm = capture.float_to_pcm16(samples)
    assert len(pcm) == len(samples) * 2  # 16-bit
    vals = struct.unpack("<5h", pcm)
    assert vals[0] == 0
    assert vals[1] == 32767
    assert vals[2] == -32767  # -1.0 * 32767
    assert vals[3] == 32767  # clipped from 2.0
    assert vals[4] == -32767  # clipped from -2.0


class _FakeStream:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.__class__.instances.append(self)
        self.started = False
        self.closed = False

    def start(self):
        self.started = True

    def stop(self):
        self.started = False

    def close(self):
        self.closed = True


def test_start_requires_device(monkeypatch):
    monkeypatch.setattr(capture, "_sd", object())
    monkeypatch.setattr(capture, "backend_available", lambda: True)
    audio_state.device_index = None
    with pytest.raises(ValueError):
        asyncio.run(capture.capture_manager.start())


def test_start_stop_lifecycle(monkeypatch):
    fake_sd = type("SD", (), {"InputStream": _FakeStream})()
    monkeypatch.setattr(capture, "_sd", fake_sd)
    monkeypatch.setattr(capture, "backend_available", lambda: True)
    monkeypatch.setattr(
        capture,
        "list_input_devices",
        lambda: [{
            "index": 1,
            "name": "Test Input",
            "channels": 1,
            "default_sample_rate": 16000,
        }],
    )
    audio_state.device_index = 1

    async def run():
        await capture.capture_manager.start()
        assert capture.capture_manager.is_capturing is True
        assert audio_state.is_capturing is True
        await capture.capture_manager.stop()
        assert capture.capture_manager.is_capturing is False
        assert audio_state.is_capturing is False

    asyncio.run(run())


def test_start_retries_without_unsupported_never_drop_input(monkeypatch):
    class _FlagRejectingStream(_FakeStream):
        def __init__(self, **kwargs):
            if kwargs.get("never_drop_input"):
                raise RuntimeError("Invalid flag [PaErrorCode -9995]")
            super().__init__(**kwargs)

    fake_sd = type("SD", (), {"InputStream": _FlagRejectingStream})()
    monkeypatch.setattr(capture, "_sd", fake_sd)
    monkeypatch.setattr(capture, "backend_available", lambda: True)
    monkeypatch.setattr(
        capture,
        "list_input_devices",
        lambda: [{
            "index": 1,
            "name": "Test Input",
            "channels": 1,
            "default_sample_rate": 16000,
        }],
    )
    audio_state.device_index = 1

    async def run():
        await capture.capture_manager.start()
        stream = capture.capture_manager._stream
        assert stream is not None
        assert "never_drop_input" not in stream.kwargs
        await capture.capture_manager.stop()

    asyncio.run(run())


def test_preroll_replayed_on_speech_onset(monkeypatch):
    """Regression: the onset of a word must reach the sink, not be sheared off.

    Energy VAD only opens once a word is already underway, so the capture
    manager replays the buffered pre-roll on the rising edge.
    """
    mgr = capture.CaptureManager()
    fed: list[bytes] = []
    mgr.speech_sink = fed.append

    speech = [False, False, False, True, True]
    monkeypatch.setattr(
        capture.vad, "get_detector", lambda: type(
            "V", (), {"process": lambda self, samples: (speech.pop(0), 0.9)}
        )()
    )
    monkeypatch.setattr(
        capture.worship_detector, "get_detector", lambda: type(
            "W", (), {"update": lambda self, rms, flat: (capture.worship_detector.SPEECH, 0.9)}
        )()
    )
    monkeypatch.setattr(capture.worship_detector, "spectral_flatness", lambda s: 0.25)

    for i in range(5):
        block = np.full((480, 1), 0.01 * (i + 1), dtype="float32")
        mgr._on_audio(block, 480, None, None)

    # 3 silent chunks of pre-roll + the 2 speech chunks.
    assert len(fed) == 5
    first = np.frombuffer(fed[0], dtype="<i2")[0]
    assert first == pytest.approx(int(0.01 * 32767), abs=2)


def test_no_preroll_replay_while_already_forwarding(monkeypatch):
    mgr = capture.CaptureManager()
    fed: list[bytes] = []
    mgr.speech_sink = fed.append
    monkeypatch.setattr(
        capture.vad, "get_detector", lambda: type(
            "V", (), {"process": lambda self, samples: (True, 0.9)}
        )()
    )
    monkeypatch.setattr(
        capture.worship_detector, "get_detector", lambda: type(
            "W", (), {"update": lambda self, rms, flat: (capture.worship_detector.SPEECH, 0.9)}
        )()
    )
    monkeypatch.setattr(capture.worship_detector, "spectral_flatness", lambda s: 0.25)

    for _ in range(4):
        mgr._on_audio(np.full((480, 1), 0.05, dtype="float32"), 480, None, None)
    # First chunk is speech immediately (empty pre-roll), then one each.
    assert len(fed) == 4
