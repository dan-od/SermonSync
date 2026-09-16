"""Voice Activity Detection (SS-010).

Two detectors behind one `process(samples) -> (is_speech, confidence)` contract:

* `SileroVAD` — the ~2 MB Silero v5 ONNX model run through onnxruntime. This is
  a trained speech/non-speech classifier, so it rejects the steady broadband
  noise (fans, HVAC, room tone) that energy alone cannot separate from speech.
  Used automatically when the model file is present.
* `EnergyVAD` — RMS against a rolling noise floor, with attack and hangover.
  The fallback when the model is missing, so the pipeline still runs.

Energy VAD is fundamentally limited: loud room noise overlaps the RMS range of
speech, so it either gates out quiet talking or lets noise through to Whisper,
which then hallucinates text over it.

Model: `models/silero_vad.onnx` (override with env SILERO_VAD_PATH), from
https://github.com/snakers4/silero-vad.
"""

from __future__ import annotations

import logging
import math
import os
from collections import deque
from pathlib import Path

logger = logging.getLogger("sermonsync.audio.vad")


def sensitivity_to_threshold(sensitivity: float) -> float:
    """Map sensitivity (0..1) to an RMS speech threshold.

    Higher sensitivity → lower threshold → more audio classified as speech.
    Range chosen for 16 kHz float32 mic input: ~0.001 (very sensitive) to
    ~0.015 (very strict). The old ceiling (0.05) sat above the median RMS of
    normal speech on a built-in mic, so only the loudest syllables passed and
    transcription arrived in disconnected bursts.
    """
    s = max(0.0, min(1.0, sensitivity))
    return 0.015 - s * (0.015 - 0.001)


class EnergyVAD:
    """Frame-wise energy VAD with hysteresis / hangover smoothing."""

    def __init__(
        self,
        sensitivity: float = 0.5,
        hangover_frames: int = 8,
        window_frames: int = 150,  # ~4.5 s at 30 ms/frame
        noise_ratio: float = 3.0,
        attack_frames: int = 3,
    ) -> None:
        self.sensitivity = sensitivity
        self.threshold = sensitivity_to_threshold(sensitivity)
        self.hangover_frames = hangover_frames
        self.noise_ratio = noise_ratio
        # A marginal frame must persist this long before the gate opens. Room
        # noise peaks in isolated blips; speech sustains. Costs nothing now
        # that capture replays a pre-roll, so the onset is kept either way.
        self.attack_frames = attack_frames
        self._speech_run = 0
        self._silence_run = 0
        self._is_speech = False
        # Noise floor = a low percentile of recent frame energy, measured over a
        # rolling window and NOT conditioned on the speech decision. Deriving it
        # only from frames already judged silent deadlocks: if the gate opens on
        # room noise it never re-learns the floor and stays open indefinitely,
        # feeding Whisper a continuous noise stream (which it hallucinates over).
        self._recent: deque[float] = deque(maxlen=window_frames)
        self._min_window = 33  # ~1 s before the measured floor is trusted
        self._noise_floor = 0.002

    def set_sensitivity(self, sensitivity: float) -> None:
        self.sensitivity = max(0.0, min(1.0, sensitivity))
        self.threshold = sensitivity_to_threshold(self.sensitivity)
        logger.info(
            "VAD sensitivity=%.2f -> threshold=%.4f", self.sensitivity, self.threshold
        )

    def reset(self) -> None:
        self._silence_run = 0
        self._speech_run = 0
        self._is_speech = False
        self._recent.clear()
        self._noise_floor = 0.002

    def process_rms(self, rms: float) -> tuple[bool, float]:
        """Classify a frame from its precomputed RMS. Returns (is_speech, conf)."""
        self._recent.append(rms)
        if len(self._recent) >= self._min_window:
            # 10th percentile: the quiet gaps between words during speech, or
            # the room itself when nobody is talking.
            ordered = sorted(self._recent)
            self._noise_floor = ordered[len(ordered) // 10]
        effective = max(self.threshold, self._noise_floor * self.noise_ratio)
        raw_speech = rms >= effective

        if raw_speech:
            self._silence_run = 0
            self._speech_run += 1
            # A strong onset opens the gate at once; a marginal one has to
            # persist, which is what separates speech from a noise blip.
            if rms >= effective * 2.0 or self._speech_run >= self.attack_frames:
                self._is_speech = True
        else:
            self._speech_run = 0
            self._silence_run += 1
            if self._silence_run > self.hangover_frames:
                self._is_speech = False

        # Confidence: how far above/below the threshold we are, squashed to 0..1.
        ratio = rms / effective if effective > 0 else 0.0
        confidence = 1.0 / (1.0 + math.exp(-4.0 * (ratio - 1.0)))
        if not self._is_speech:
            confidence = min(confidence, 1.0 - confidence)
        return self._is_speech, round(float(confidence), 4)

    def process(self, samples) -> tuple[bool, float]:
        """Classify a float32 sample buffer. Returns (is_speech, confidence)."""
        from .capture import compute_levels

        rms, _peak = compute_levels(samples)
        return self.process_rms(rms)


def sensitivity_to_probability(sensitivity: float) -> float:
    """Map sensitivity (0..1) to a Silero speech-probability threshold.

    Higher sensitivity → lower probability required. 0.5 lands on Silero's own
    recommended default of 0.5.
    """
    s = max(0.0, min(1.0, sensitivity))
    return 0.85 - s * (0.85 - 0.15)


DEFAULT_MODEL_PATH = Path(__file__).resolve().parents[2] / "models" / "silero_vad.onnx"


def model_path() -> Path:
    return Path(os.environ.get("SILERO_VAD_PATH", str(DEFAULT_MODEL_PATH)))


class SileroVAD:
    """Silero v5 speech classifier (ONNX), same contract as EnergyVAD."""

    # Silero v5 consumes 512 new samples per inference at 16 kHz, prepended
    # with 64 samples of the preceding audio. Feeding a bare 512 window instead
    # makes the model score even clear speech at ~0.001 — it reads as silence.
    WINDOW = 512
    CONTEXT = 64

    def __init__(
        self,
        session,
        sensitivity: float = 0.5,
        hangover_frames: int = 8,
        sample_rate: int = 16000,
    ) -> None:
        import numpy as np

        self._np = np
        self._sess = session
        self.sensitivity = sensitivity
        self.threshold = sensitivity_to_probability(sensitivity)
        self.hangover_frames = hangover_frames
        self._sr = np.array(sample_rate, dtype="int64")
        self._state = np.zeros((2, 1, 128), dtype="float32")
        # Capture delivers 480-sample chunks; hold the remainder between calls
        # so the model always sees exactly WINDOW samples.
        self._tail = np.zeros(0, dtype="float32")
        self._context = np.zeros(self.CONTEXT, dtype="float32")
        self._silence_run = 0
        self._is_speech = False
        self._last_prob = 0.0

    @classmethod
    def load(cls, path: Path, **kwargs) -> SileroVAD:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        # Single-threaded: this runs inside the PortAudio callback, where
        # spawning thread pools per inference would cost more than the model.
        opts.inter_op_num_threads = 1
        opts.intra_op_num_threads = 1
        session = ort.InferenceSession(
            str(path), opts, providers=["CPUExecutionProvider"]
        )
        return cls(session, **kwargs)

    def set_sensitivity(self, sensitivity: float) -> None:
        self.sensitivity = max(0.0, min(1.0, sensitivity))
        self.threshold = sensitivity_to_probability(self.sensitivity)
        logger.info(
            "Silero VAD sensitivity=%.2f -> p>=%.2f", self.sensitivity, self.threshold
        )

    def reset(self) -> None:
        self._state = self._np.zeros((2, 1, 128), dtype="float32")
        self._tail = self._np.zeros(0, dtype="float32")
        self._context = self._np.zeros(self.CONTEXT, dtype="float32")
        self._silence_run = 0
        self._is_speech = False
        self._last_prob = 0.0

    def process(self, samples) -> tuple[bool, float]:
        np = self._np
        arr = np.asarray(samples, dtype="float32").ravel()
        buf = np.concatenate([self._tail, arr]) if self._tail.size else arr

        windows = len(buf) // self.WINDOW
        prob = self._last_prob
        for i in range(windows):
            chunk = buf[i * self.WINDOW : (i + 1) * self.WINDOW]
            inp = np.concatenate([self._context, chunk]).reshape(1, -1)
            out, self._state = self._sess.run(
                None, {"input": inp, "state": self._state, "sr": self._sr}
            )
            self._context = chunk[-self.CONTEXT :]
            prob = float(out[0][0])
        self._tail = buf[windows * self.WINDOW :]
        self._last_prob = prob

        if prob >= self.threshold:
            self._silence_run = 0
            self._is_speech = True
        else:
            self._silence_run += 1
            if self._silence_run > self.hangover_frames:
                self._is_speech = False
        return self._is_speech, round(prob, 4)

    def process_rms(self, rms: float) -> tuple[bool, float]:
        """Energy-only fallback path; Silero needs samples, so reuse last state."""
        return self._is_speech, round(self._last_prob, 4)


def _build_detector():
    path = model_path()
    if path.exists():
        try:
            detector = SileroVAD.load(path)
            logger.info("VAD: Silero v5 (%s)", path)
            return detector
        except Exception as exc:
            logger.warning("Silero VAD unavailable (%s); using energy VAD", exc)
    else:
        logger.info("VAD: energy (no Silero model at %s)", path)
    return EnergyVAD()


_detector = None


def get_detector():
    global _detector
    if _detector is None:
        _detector = _build_detector()
    return _detector


def set_detector(detector) -> None:
    """Override the process-wide detector (tests / explicit selection)."""
    global _detector
    _detector = detector


def set_sensitivity(sensitivity: float) -> None:
    get_detector().set_sensitivity(sensitivity)
