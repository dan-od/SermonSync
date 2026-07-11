"""Unit tests for worship/music heuristic detection (SS-012)."""

from __future__ import annotations

import numpy as np
from engine.audio.worship_detector import (
    SILENCE,
    SPEECH,
    WORSHIP,
    WorshipDetector,
    spectral_flatness,
)


def test_spectral_flatness_tone_vs_noise():
    t = np.linspace(0, 1, 480, dtype="float32")
    tone = np.sin(2 * np.pi * 440 * t).astype("float32")  # pure tone
    rng = np.random.default_rng(0)
    noise = rng.standard_normal(480).astype("float32") * 0.3
    # Tonal signal is far flatter-spectrum-wise (lower flatness) than noise.
    assert spectral_flatness(tone) < spectral_flatness(noise)


def test_spectral_flatness_silence_is_zero():
    assert spectral_flatness(np.zeros(480, dtype="float32")) == 0.0


def test_silence_state():
    det = WorshipDetector()
    for _ in range(70):
        state, _ = det.update(0.0001, flatness=0.0)
    assert state == SILENCE


def test_worship_state_sustained_tonal():
    det = WorshipDetector()
    # Sustained steady energy + tonal (low flatness) => worship.
    state = SILENCE
    for _ in range(70):
        state, conf = det.update(0.15, flatness=0.05)
    assert state == WORSHIP
    assert conf > 0.5


def test_speech_state_bursty():
    det = WorshipDetector()
    # Bursty energy (alternating loud/quiet) + high flatness => speech.
    state = SILENCE
    for i in range(70):
        rms = 0.2 if i % 3 == 0 else 0.001
        state, _ = det.update(rms, flatness=0.6)
    assert state == SPEECH


def test_reset():
    det = WorshipDetector()
    for _ in range(70):
        det.update(0.15, flatness=0.05)
    det.reset()
    assert det.state == SILENCE
    assert len(det._rms) == 0
