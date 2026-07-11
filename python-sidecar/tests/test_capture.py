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
    def __init__(self, **kwargs):
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
    audio_state.device_index = 1

    async def run():
        await capture.capture_manager.start()
        assert capture.capture_manager.is_capturing is True
        assert audio_state.is_capturing is True
        await capture.capture_manager.stop()
        assert capture.capture_manager.is_capturing is False
        assert audio_state.is_capturing is False

    asyncio.run(run())
