"""Unit tests for energy-based VAD (SS-010)."""

from __future__ import annotations

import numpy as np
import pytest
from engine.audio import vad as vad_mod
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


def test_speech_keeps_passing_across_inter_word_gaps():
    """Regression: the gate must not close on the gaps *inside* an utterance.

    The measured noise floor has to track the room, not the quiet moments
    between words — otherwise it climbs toward speech level and the pipeline
    goes deaf partway through a sentence.
    """
    vad = EnergyVAD(sensitivity=0.5, hangover_frames=8)
    for _ in range(200):  # alternating speech / short inter-word gaps
        vad.process_rms(0.03)
        for _ in range(3):
            vad.process_rms(0.004)
    is_speech, _ = vad.process_rms(0.03)
    assert is_speech is True


def test_steady_room_noise_does_not_latch_open():
    """Regression: a constant noise floor must not read as endless speech.

    The floor used to be estimated only from frames already judged silent, so
    once the gate opened on room noise it never re-learned and stayed open —
    feeding Whisper a continuous noise stream, which it hallucinates over.
    """
    vad = EnergyVAD(sensitivity=0.5, hangover_frames=8)
    # Noise well above the absolute threshold (a hot input gain), but steady.
    for _ in range(300):
        is_speech, _ = vad.process_rms(0.02)
    assert is_speech is False
    # Genuine speech above that noise still gets through.
    for _ in range(5):
        is_speech, _ = vad.process_rms(0.09)
    assert is_speech is True


def test_default_threshold_below_normal_speech_level():
    # Median RMS of normal speech on a built-in mic measures ~0.018; the
    # default threshold must sit well under it.
    assert sensitivity_to_threshold(0.5) < 0.018


# --- Silero (skipped when the model isn't downloaded) ---------------------
_HAS_SILERO = vad_mod.model_path().exists()
silero_only = pytest.mark.skipif(_HAS_SILERO is False, reason="silero model absent")


@silero_only
def test_silero_scores_speech_above_silence():
    """The trained model must separate speech from silence.

    Guards the input format: Silero v5 needs 64 context samples prepended to
    each 512-sample window. Feed it a bare window and it scores even clear
    speech at ~0.001, i.e. the pipeline goes permanently deaf.
    """
    det = vad_mod.SileroVAD.load(vad_mod.model_path())
    silence = np.zeros(480, dtype="float32")
    for _ in range(20):
        det.process(silence)
    _, quiet_prob = det.process(silence)

    det.reset()
    rng = np.random.default_rng(0)
    # Voiced-speech-like: harmonic stack with an amplitude envelope.
    t = np.arange(16000 * 2, dtype="float32") / 16000.0
    tone = sum(np.sin(2 * np.pi * f * t) / (i + 1) for i, f in enumerate([120, 240, 360, 480]))
    env = 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)
    speech = (tone * env * 0.2 + rng.standard_normal(len(t)) * 0.005).astype("float32")
    probs = [det.process(speech[i : i + 480])[1] for i in range(0, len(speech) - 480, 480)]

    assert quiet_prob < 0.1
    assert max(probs) > quiet_prob


@silero_only
def test_silero_sensitivity_maps_to_probability():
    det = vad_mod.SileroVAD.load(vad_mod.model_path())
    det.set_sensitivity(0.5)
    assert det.threshold == pytest.approx(0.5, abs=0.01)
    det.set_sensitivity(1.0)
    low = det.threshold
    det.set_sensitivity(0.0)
    assert low < det.threshold  # more sensitive => lower bar


def test_get_detector_falls_back_to_energy_without_model(monkeypatch, tmp_path):
    monkeypatch.setenv("SILERO_VAD_PATH", str(tmp_path / "missing.onnx"))
    vad_mod.set_detector(None)
    try:
        assert isinstance(vad_mod.get_detector(), EnergyVAD)
    finally:
        vad_mod.set_detector(None)
