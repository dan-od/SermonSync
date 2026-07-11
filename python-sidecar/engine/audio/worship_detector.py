"""Worship / music auto-detection (SS-012).

Heuristic discriminator between sung worship (sustained, tonal, few silence
gaps) and preaching (bursty energy, more gaps). Runs over a rolling window of
recent frames and emits SILENCE / SPEECH / WORSHIP with a confidence.

When worship is detected the pipeline reduces/pauses transcription (music is
not something we want to caption or scripture-match).

TODO(ML): replace the heuristic with a small audio-scene classifier
(e.g. YAMNet / PANNs speech-vs-music head) for robustness across rooms/mics.
"""

from __future__ import annotations

import logging
import math
from collections import deque

logger = logging.getLogger("sermonsync.audio.worship")

SILENCE = "silence"
SPEECH = "speech"
WORSHIP = "worship"


def spectral_flatness(samples) -> float:
    """Spectral flatness (0..1). Low = tonal/musical, high = noise-like.

    Returns 0.0 for empty/silent input.
    """
    try:
        import numpy as np
    except ImportError:  # pragma: no cover
        return 0.0
    arr = np.asarray(samples, dtype="float32").ravel()
    if arr.size == 0 or float(np.max(np.abs(arr))) < 1e-6:
        return 0.0
    spec = np.abs(np.fft.rfft(arr)) + 1e-10
    geo_mean = np.exp(np.mean(np.log(spec)))
    arith_mean = np.mean(spec)
    return float(geo_mean / arith_mean)


class WorshipDetector:
    def __init__(
        self,
        window_frames: int = 66,  # ~2 s at 30 ms/frame
        silence_rms: float = 0.005,
        active_ratio_min: float = 0.6,
        cv_music_max: float = 0.4,
        flatness_music_max: float = 0.35,
    ) -> None:
        self.window_frames = window_frames
        self.silence_rms = silence_rms
        self.active_ratio_min = active_ratio_min
        self.cv_music_max = cv_music_max
        self.flatness_music_max = flatness_music_max
        self._rms: deque[float] = deque(maxlen=window_frames)
        self._flatness: deque[float] = deque(maxlen=window_frames)
        self.state = SILENCE

    def reset(self) -> None:
        self._rms.clear()
        self._flatness.clear()
        self.state = SILENCE

    def update(self, rms: float, flatness: float | None = None) -> tuple[str, float]:
        """Feed one frame; returns (state, confidence)."""
        self._rms.append(rms)
        if flatness is not None:
            self._flatness.append(flatness)

        active = [r for r in self._rms if r > self.silence_rms]
        active_ratio = len(active) / len(self._rms) if self._rms else 0.0

        if active_ratio < 0.15:
            self.state = SILENCE
            return SILENCE, round(1.0 - active_ratio, 4)

        mean_e = sum(active) / len(active)
        if len(active) > 1 and mean_e > 0:
            var = sum((r - mean_e) ** 2 for r in active) / len(active)
            cv = math.sqrt(var) / mean_e
        else:
            cv = 1.0

        avg_flat = (
            sum(self._flatness) / len(self._flatness) if self._flatness else 1.0
        )

        # Music: sustained (high active ratio), steady energy (low CV), tonal
        # (low spectral flatness).
        sustained = active_ratio >= self.active_ratio_min
        steady = cv <= self.cv_music_max
        tonal = avg_flat <= self.flatness_music_max

        music_signals = sum([sustained, steady, tonal])
        if music_signals >= 2:
            self.state = WORSHIP
            confidence = 0.5 + 0.5 * (music_signals / 3.0)
            return WORSHIP, round(min(confidence, 0.99), 4)

        self.state = SPEECH
        # More gaps / burstier energy => more confident it's speech.
        confidence = min(0.99, 0.5 + 0.5 * min(cv, 1.0))
        return SPEECH, round(confidence, 4)


_detector = WorshipDetector()


def get_detector() -> WorshipDetector:
    return _detector
