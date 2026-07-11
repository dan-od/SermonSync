"""Unit tests for energy-based VAD (SS-010)."""

from __future__ import annotations

import numpy as np
from engine.audio.vad import EnergyVAD, sensitivity_to_threshold


def test_sensitivity_threshold_monotonic():
    # Higher sensitivity => lower threshold.
    assert sensitivity_to_threshold(0.0) > sensitivity_to_threshold(0.5)
    assert sensitivity_to_threshold(0.5) > sensitivity_to_threshold(1.0)
    assert sensitivity_to_threshold(1.0) >= 0.0


def test_loud_frame_is_speech():
    vad = EnergyVAD(sensitivity=0.5)
    is_speech, conf = vad.process_rms(0.2)  # well above threshold
    assert is_speech is True
    assert conf > 0.5


def test_quiet_frame_is_silence_after_hangover():
    vad = EnergyVAD(sensitivity=0.5, hangover_frames=2)
    vad.process_rms(0.2)  # speech
    # feed several quiet frames to exhaust hangover
    for _ in range(5):
        is_speech, _ = vad.process_rms(0.0005)
    assert is_speech is False


def test_hangover_keeps_speech_briefly():
    vad = EnergyVAD(sensitivity=0.5, hangover_frames=5)
    vad.process_rms(0.2)  # speech on
    is_speech, _ = vad.process_rms(0.0005)  # one quiet frame within hangover
    assert is_speech is True


def test_process_with_samples():
    vad = EnergyVAD(sensitivity=0.5)
    loud = np.full(480, 0.3, dtype="float32")
    quiet = np.full(480, 0.0001, dtype="float32")
    assert vad.process(loud)[0] is True
    vad.reset()
    for _ in range(20):
        result = vad.process(quiet)
    assert result[0] is False


def test_set_sensitivity_updates_threshold():
    vad = EnergyVAD(sensitivity=0.5)
    t_mid = vad.threshold
    vad.set_sensitivity(1.0)
    assert vad.threshold < t_mid
