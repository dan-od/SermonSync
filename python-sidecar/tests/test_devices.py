"""Unit tests for audio device enumeration/selection (SS-008).

The audio backend (sounddevice/PortAudio) is mocked so these run anywhere,
including headless CI with no real audio hardware.
"""

from __future__ import annotations

import types

import pytest
from api import audio as audio_api
from engine.audio import devices
from engine.audio.state import audio_state
from fastapi import HTTPException

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


def test_refresh_lists_device_plugged_in_after_start(fake_backend):
    calls = []
    plugged_in = False

    def initialize():
        nonlocal plugged_in
        calls.append("initialize")
        plugged_in = True

    fake_backend._terminate = lambda: calls.append("terminate")
    fake_backend._initialize = initialize
    fake_backend.query_devices = lambda: FAKE_DEVICES + ([
        {"name": "New USB Mixer", "max_input_channels": 2, "default_samplerate": 48000.0}
    ] if plugged_in else [])

    assert len(devices.list_input_devices()) == 3
    refreshed = devices.list_input_devices(refresh=True)
    assert calls == ["terminate", "initialize"]
    assert refreshed[-1]["name"] == "New USB Mixer"


def test_refresh_failure_is_reported(fake_backend):
    def fail_initialize():
        raise RuntimeError("PortAudio unavailable")

    fake_backend._initialize = fail_initialize
    with pytest.raises(devices.AudioBackendError, match="could not refresh audio input devices"):
        devices.list_input_devices(refresh=True)


def test_scan_does_not_restart_backend_during_capture(fake_backend, monkeypatch):
    monkeypatch.setattr(audio_api, "capture_manager", types.SimpleNamespace(is_capturing=True))
    with pytest.raises(HTTPException) as exc:
        audio_api.get_devices(refresh=True)
    assert exc.value.status_code == 409


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
