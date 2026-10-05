"""Persistence checks for operator-controlled audio settings."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

from api import audio as audio_api


def test_vad_sensitivity_is_saved(monkeypatch):
    store = Mock()
    set_sensitivity = Mock()
    monkeypatch.setattr(audio_api, "get_store", lambda: store)
    monkeypatch.setattr(audio_api.vad, "set_sensitivity", set_sensitivity)
    monkeypatch.setattr(audio_api.vad, "get_detector", lambda: SimpleNamespace(threshold=0.1234))

    response = audio_api.set_vad_sensitivity(audio_api.VadSensitivityRequest(sensitivity=0.73))

    set_sensitivity.assert_called_once_with(0.73)
    store.set_setting.assert_called_once_with("vad_sensitivity", 0.73)
    assert audio_api.audio_state.vad_sensitivity == 0.73
    assert response == {"sensitivity": 0.73, "threshold": 0.1234}
