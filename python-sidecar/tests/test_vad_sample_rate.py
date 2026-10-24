"""VAD and resampling see 16 kHz mono whatever the device delivers (fix A)."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
import pytest
from engine.audio import capture, vad, worship_detector

FIXTURE = Path(__file__).parent / "fixtures" / "speech_16k.wav"


def _speech_16k() -> np.ndarray:
    with wave.open(str(FIXTURE)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype("float32") / 32768


def _upsample(x: np.ndarray, factor: int) -> np.ndarray:
    """Band-limited upsampling (zero-stuff + FFT brick-wall), like a real
    48 kHz recording of the same 16 kHz-band speech."""
    n = x.size * factor
    spec = np.fft.rfft(x)
    up = np.zeros(n // 2 + 1, dtype=complex)
    up[: spec.size] = spec
    return (np.fft.irfft(up, n) * factor).astype("float32")


def _frames(signal: np.ndarray, frame: int):
    for i in range(0, signal.shape[0] - frame + 1, frame):
        yield signal[i : i + frame]


def _decisions(detector, frames, rate):
    """Run frames through the capture path; return (VAD decisions, input shapes)."""
    mgr = capture.CaptureManager()
    mgr.speech_sink = None
    decisions, shapes = [], []

    class Spy:
        def process(self, samples):
            shapes.append(np.asarray(samples).shape)
            result = detector.process(samples)
            decisions.append(result[0])
            return result

    vad.set_detector(Spy())
    worship_detector._detector.reset()
    try:
        for f in frames:
            mgr.process_frame(f, rate)
    finally:
        vad.set_detector(None)
    return decisions, shapes


@pytest.fixture
def silero():
    path = vad.model_path()
    if not path.exists():
        pytest.skip(f"Silero model not found at {path} (set SILERO_VAD_PATH)")
    return lambda: vad.SileroVAD.load(path, hangover_ms=300)


def test_48k_stereo_and_16k_mono_give_the_same_vad_decisions(silero):
    mono16 = _speech_16k()
    stereo48 = np.repeat(_upsample(mono16, 3)[:, None], 2, axis=1)

    d16, shapes16 = _decisions(silero(), _frames(mono16, 320), 16000)
    d48, shapes48 = _decisions(silero(), _frames(stereo48, 960), 48000)

    # Silero only ever sees 20 ms of 16 kHz mono.
    assert set(shapes16) == {(320,)} and set(shapes48) == {(320,)}
    n = min(len(d16), len(d48))
    agreement = np.mean(np.array(d16[:n]) == np.array(d48[:n]))
    assert agreement >= 0.97, agreement
    # Same utterances: identical number of speech onsets.
    def onsets(d):
        return sum(1 for a, b in zip([False] + d, d) if b and not a)

    assert onsets(d16[:n]) == onsets(d48[:n]) >= 2
    # And it hears the speech at all: well over a second of it.
    assert sum(d48) * 0.02 > 1.5


def test_silero_hangover_is_milliseconds_not_calls(silero):
    det = silero()
    det._is_speech = True
    det._last_prob = 0.0
    # 280 ms of silence in 20 ms calls: still inside the 300 ms hangover.
    quiet = np.zeros(320, dtype="float32")
    for _ in range(14):
        is_speech, _ = det.process(quiet)
    assert is_speech is True
    for _ in range(2):
        is_speech, _ = det.process(quiet)
    assert is_speech is False


def test_energy_vad_hangover_ms():
    det = vad.EnergyVAD(hangover_ms=300)
    assert det.hangover_frames == 15
    assert vad.EnergyVAD(hangover_frames=8).hangover_ms == 160


@pytest.mark.parametrize("rate", [48000, 44100, 32000])
def test_stream_resampler_is_frame_invariant(rate):
    rng = np.random.default_rng(1)
    signal = rng.standard_normal(rate).astype("float32") * 0.1
    frame = round(rate * 0.02)
    whole = capture.StreamResampler(rate).process(signal)
    pieces = capture.StreamResampler(rate)
    framed = np.concatenate([pieces.process(signal[i : i + frame]) for i in range(0, rate, frame)])
    n = min(whole.size, framed.size)
    assert abs(whole.size - framed.size) <= 1
    assert np.allclose(whole[:n], framed[:n], atol=1e-5)
    assert abs(framed.size - 16000) <= 1


def test_stream_resampler_keeps_speech_band_and_rejects_aliases():
    rate = 48000
    t = np.arange(rate) / rate
    r = capture.StreamResampler(rate)
    voice = r.process((0.5 * np.sin(2 * np.pi * 1000 * t)).astype("float32"))
    assert np.sqrt(np.mean(voice[400:] ** 2)) == pytest.approx(0.5 / np.sqrt(2), rel=0.02)
    # 12 kHz would fold to 4 kHz without the anti-alias filter.
    r = capture.StreamResampler(rate)
    alias = r.process((0.5 * np.sin(2 * np.pi * 12000 * t)).astype("float32"))
    assert np.sqrt(np.mean(alias[400:] ** 2)) < 0.01
    legacy = capture.resample_to_transcription_rate(
        (0.5 * np.sin(2 * np.pi * 12000 * t)).astype("float32"), rate
    )
    assert np.sqrt(np.mean(legacy**2)) > 0.1
