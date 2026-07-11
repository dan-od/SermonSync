"""Audio input device enumeration and selection (SS-008).

Uses sounddevice (PortAudio). The import is guarded so the sidecar still starts
on machines without a working PortAudio backend (e.g. headless CI); calls then
raise AudioBackendError which the API surfaces as HTTP 503.
"""

from __future__ import annotations

import logging

from .state import audio_state

logger = logging.getLogger("sermonsync.audio.devices")

try:  # PortAudio may be missing on headless/CI machines.
    import sounddevice as _sd
except (OSError, ImportError) as exc:  # pragma: no cover - env dependent
    _sd = None
    logger.warning("sounddevice unavailable: %s", exc)


class AudioBackendError(RuntimeError):
    """Raised when the audio backend (PortAudio) is not available."""


def backend_available() -> bool:
    return _sd is not None


def _require_backend():
    if _sd is None:
        raise AudioBackendError(
            "audio backend (PortAudio/sounddevice) is not available on this host"
        )
    return _sd


def refresh_devices() -> None:
    """Re-scan hardware so hot-plugged/removed devices are picked up."""
    sd = _require_backend()
    try:
        sd._terminate()
        sd._initialize()
    except Exception as exc:  # pragma: no cover - backend specific
        logger.warning("device refresh failed: %s", exc)


def _default_input_index() -> int | None:
    sd = _require_backend()
    try:
        default = sd.default.device
        idx = default[0] if isinstance(default, (list, tuple)) else default
        return int(idx) if idx is not None and idx >= 0 else None
    except Exception:  # pragma: no cover
        return None


def list_input_devices(refresh: bool = False) -> list[dict]:
    """Return all input-capable devices with metadata."""
    sd = _require_backend()
    if refresh:
        refresh_devices()

    default_idx = _default_input_index()
    devices = sd.query_devices()
    result: list[dict] = []
    for idx, dev in enumerate(devices):
        if dev.get("max_input_channels", 0) > 0:
            result.append(
                {
                    "index": idx,
                    "name": dev["name"],
                    "channels": dev["max_input_channels"],
                    "default_sample_rate": int(dev.get("default_samplerate", 0)),
                    "is_default": idx == default_idx,
                }
            )
    return result


def select_device(index: int | None = None, name: str | None = None) -> dict:
    """Set the active input device by index or name; returns the chosen device."""
    devices = list_input_devices()
    if not devices:
        raise AudioBackendError("no input devices available")

    chosen: dict | None = None
    if index is not None:
        chosen = next((d for d in devices if d["index"] == index), None)
        if chosen is None:
            raise ValueError(f"no input device with index {index}")
    elif name is not None:
        lname = name.lower()
        chosen = next((d for d in devices if lname in d["name"].lower()), None)
        if chosen is None:
            raise ValueError(f"no input device matching name '{name}'")
    else:
        raise ValueError("provide either 'index' or 'name'")

    audio_state.device_index = chosen["index"]
    audio_state.device_name = chosen["name"]
    logger.info("selected input device: [%s] %s", chosen["index"], chosen["name"])
    return chosen


def get_selected_device() -> dict | None:
    """Return the currently selected device, or None. Detects unplug."""
    if audio_state.device_index is None:
        return None
    try:
        devices = list_input_devices()
    except AudioBackendError:
        return None
    current = next(
        (d for d in devices if d["index"] == audio_state.device_index), None
    )
    if current is None:
        # Selected device disappeared (unplugged).
        logger.warning(
            "selected device [%s] '%s' is no longer present",
            audio_state.device_index,
            audio_state.device_name,
        )
    return current
