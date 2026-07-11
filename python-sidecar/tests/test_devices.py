"""Unit tests for audio device enumeration/selection (SS-008).

The audio backend (sounddevice/PortAudio) is mocked so these run anywhere,
including headless CI with no real audio hardware.
"""

from __future__ import annotations

import types

import pytest
from engine.audio import devices
from engine.audio.state import audio_state

FAKE_DEVICES = [
    {"name": "MacBook Pro Microphone", "max_input_channels": 3, "default_samplerate": 48000.0},
    {"name": "USB Podcast Mic", "max_input_channels": 1, "default_samplerate": 44100.0},
    {"name": "Built-in Output", "max_input_channels": 0, "default_samplerate": 48000.0},
    {"name": "Aggregate Device", "max_input_channels": 2, "default_samplerate": 96000.0},
]


@pytest.fixture
def fake_backend(monkeypatch):
    fake_sd = types.SimpleNamespace(
        query_devices=lambda: FAKE_DEVICES,
        default=types.SimpleNamespace(device=(0, 1)),
        _initialize=lambda: None,
        _terminate=lambda: None,
    )
    monkeypatch.setattr(devices, "_sd", fake_sd)
    # reset selection between tests
    audio_state.device_index = None
    audio_state.device_name = None
    yield fake_sd


def test_backend_available(fake_backend):
    assert devices.backend_available() is True


def test_lists_only_input_devices(fake_backend):
    result = devices.list_input_devices()
    names = [d["name"] for d in result]
    assert "Built-in Output" not in names  # 0 input channels filtered
    assert len(result) == 3
    assert result[0]["index"] == 0
    assert result[0]["is_default"] is True
    assert result[0]["channels"] == 3


def test_select_by_index(fake_backend):
    chosen = devices.select_device(index=3)
    assert chosen["name"] == "Aggregate Device"
    assert audio_state.device_index == 3


def test_select_by_name_substring(fake_backend):
    chosen = devices.select_device(name="podcast")
    assert chosen["name"] == "USB Podcast Mic"
    assert audio_state.device_index == 1


def test_select_unknown_index_raises(fake_backend):
    with pytest.raises(ValueError):
        devices.select_device(index=99)


def test_select_requires_arg(fake_backend):
    with pytest.raises(ValueError):
        devices.select_device()


def test_unplug_detection(fake_backend):
    devices.select_device(index=1)
    # Simulate the device disappearing.
    fake_backend.query_devices = lambda: FAKE_DEVICES[:1]
    assert devices.get_selected_device() is None


def test_backend_unavailable(monkeypatch):
    monkeypatch.setattr(devices, "_sd", None)
    assert devices.backend_available() is False
    with pytest.raises(devices.AudioBackendError):
        devices.list_input_devices()
