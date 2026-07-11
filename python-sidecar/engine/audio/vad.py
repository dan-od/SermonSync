"""Voice Activity Detection (SS-010).

Ships an energy-based VAD (RMS vs an adaptive noise floor, with a hangover so
word endings aren't clipped). This is the working default so the pipeline isn't
blocked on a large model download.

TODO(SS-010 / Silero): swap in Silero VAD for music/noise robustness. Either
`pip install silero-vad` (pulls torch, ~200 MB) or run the ~2 MB Silero ONNX
model via onnxruntime. Implement `SileroVAD` with the same `process()` contract
and select it in `get_detector()` when the model is present.
"""

from __future__ import annotations

import logging
import math

logger = logging.getLogger("sermonsync.audio.vad")


def sensitivity_to_threshold(sensitivity: float) -> float:
    """Map sensitivity (0..1) to an RMS speech threshold.

    Higher sensitivity → lower threshold → more audio classified as speech.
    Range chosen for 16 kHz float32 mic input: ~0.003 (very sensitive) to
    ~0.05 (very strict).
    """
    s = max(0.0, min(1.0, sensitivity))
    return 0.05 - s * (0.05 - 0.003)


class EnergyVAD:
    """Frame-wise energy VAD with hysteresis / hangover smoothing."""

    def __init__(self, sensitivity: float = 0.5, hangover_frames: int = 8) -> None:
        self.sensitivity = sensitivity
        self.threshold = sensitivity_to_threshold(sensitivity)
        self.hangover_frames = hangover_frames
        self._silence_run = 0
        self._is_speech = False
        # Adaptive noise floor (slow EMA of quiet frames).
        self._noise_floor = 0.002

    def set_sensitivity(self, sensitivity: float) -> None:
        self.sensitivity = max(0.0, min(1.0, sensitivity))
        self.threshold = sensitivity_to_threshold(self.sensitivity)
        logger.info(
            "VAD sensitivity=%.2f -> threshold=%.4f", self.sensitivity, self.threshold
        )

    def reset(self) -> None:
        self._silence_run = 0
        self._is_speech = False

    def process_rms(self, rms: float) -> tuple[bool, float]:
        """Classify a frame from its precomputed RMS. Returns (is_speech, conf)."""
        effective = max(self.threshold, self._noise_floor * 3.0)
        raw_speech = rms >= effective

        if raw_speech:
            self._silence_run = 0
            self._is_speech = True
        else:
            # Slowly adapt the noise floor toward quiet frames.
            self._noise_floor = 0.995 * self._noise_floor + 0.005 * rms
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


_detector = EnergyVAD()


def get_detector() -> EnergyVAD:
    return _detector


def set_sensitivity(sensitivity: float) -> None:
    _detector.set_sensitivity(sensitivity)
