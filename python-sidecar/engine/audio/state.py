"""Shared audio-pipeline state.

A single process-wide object the audio modules (devices, capture, VAD, worship
detector) read/write so REST endpoints and the capture thread agree on the
active device and settings.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AudioState:
    # Device selection
    device_index: int | None = None
    device_name: str | None = None

    # Capture config (Whisper wants 16 kHz mono PCM16)
    sample_rate: int = 16000
    channels: int = 1
    chunk_samples: int = 480  # ~30 ms at 16 kHz

    # Runtime flags
    is_capturing: bool = False

    # VAD (SS-010)
    vad_sensitivity: float = 0.5  # 0.0 - 1.0

    # Latest metering (SS-009)
    last_rms: float = 0.0
    last_peak: float = 0.0

    # Worship/speech state (SS-012)
    acoustic_state: str = "silence"  # silence | speech | worship

    extra: dict = field(default_factory=dict)


# Process-wide singleton.
audio_state = AudioState()
