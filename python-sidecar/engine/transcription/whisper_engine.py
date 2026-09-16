"""Faster-Whisper real-time transcription engine (SS-013).

Wraps faster-whisper (CTranslate2). Auto-detects CUDA (falls back to CPU int8),
and loads the configured model with a fallback chain so a too-large download
degrades gracefully instead of failing.

Model selection: env WHISPER_MODEL (default "base" — set to "large-v3" for
production). Measured on CPU int8 with 3 s chunks: tiny 0.25x realtime but
badly garbled, base 0.20x and near-verbatim, small 0.89x (too little headroom
for live use). If faster-whisper is unavailable or no model loads, a
MockWhisperEngine returns deterministic dummy text so the rest of the pipeline
keeps working.
"""

from __future__ import annotations

import logging
import math
import os

logger = logging.getLogger("sermonsync.transcription.whisper")

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

# Preferred → fallbacks. Production should set WHISPER_MODEL=large-v3.
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "base")
FALLBACK_CHAIN = [DEFAULT_MODEL, "base", "tiny"]


def _pick_device() -> tuple[str, str]:
    """Return (device, compute_type) — CUDA if available, else CPU int8."""
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", "float16"
    except Exception:  # pragma: no cover - ctranslate2 optional/no cuda
        pass
    return "cpu", "int8"


def _logprob_to_confidence(avg_logprob: float) -> float:
    return round(max(0.0, min(1.0, math.exp(avg_logprob))), 4)


class MockWhisperEngine:
    """Stand-in that returns deterministic dummy text (no model needed)."""

    is_mock = True
    model_size = "mock"
    device = "cpu"
    compute_type = "n/a"

    def transcribe(self, audio, language: str | None = None) -> list[dict]:
        n = len(audio) if audio is not None else 0
        seconds = round(n / 16000.0, 2)
        return [
            {
                "text": f"[mock transcription of {seconds}s of speech]",
                "start": 0.0,
                "end": seconds,
                "confidence": 0.5,
                "no_speech_prob": 0.0,
                "language": language or "en",
            }
        ]


class WhisperEngine:
    is_mock = False

    def __init__(self, model_size: str, device: str, compute_type: str, model) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = model
        # Set by load(); the requested model differs from model_size whenever
        # the fallback chain kicked in.
        self.requested_model = model_size
        self.degraded = False

    @classmethod
    def load(cls, candidates: list[str] | None = None) -> WhisperEngine:
        from faster_whisper import WhisperModel

        device, compute_type = _pick_device()
        requested = (candidates or FALLBACK_CHAIN)[0]
        tried = []
        for size in candidates or FALLBACK_CHAIN:
            if size in tried:
                continue
            tried.append(size)
            try:
                logger.info("loading Whisper model '%s' on %s/%s", size, device, compute_type)
                model = WhisperModel(size, device=device, compute_type=compute_type)
                degraded = size != requested
                # WARNING so the operator can grep one line for the truth. A
                # silent fallback to a smaller model is the failure mode this
                # exists to expose.
                logger.warning(
                    "WHISPER ENGINE LOADED: model=%s device=%s compute_type=%s%s",
                    size,
                    device,
                    compute_type,
                    f" (DEGRADED - requested '{requested}' failed)" if degraded else "",
                )
                engine = cls(size, device, compute_type, model)
                engine.requested_model = requested
                engine.degraded = degraded
                return engine
            except Exception as exc:
                logger.warning("failed to load Whisper '%s': %s", size, exc)
        raise RuntimeError(f"no Whisper model could be loaded (tried {tried})")

    def transcribe(self, audio, language: str | None = None) -> list[dict]:
        """Transcribe a float32 mono 16 kHz buffer; returns segment dicts."""
        segments, info = self._model.transcribe(
            audio,
            language=language,
            beam_size=1,
            vad_filter=False,  # our own VAD already gates the stream
        )
        results = []
        for seg in segments:
            results.append(
                {
                    "text": seg.text.strip(),
                    "start": round(seg.start, 3),
                    "end": round(seg.end, 3),
                    "confidence": _logprob_to_confidence(seg.avg_logprob),
                    "no_speech_prob": round(seg.no_speech_prob, 4),
                    "language": info.language,
                }
            )
        return results


_engine = None


def get_engine():
    """Return the process-wide engine, loading it (or a mock) on first use."""
    global _engine
    if _engine is not None:
        return _engine
    try:
        _engine = WhisperEngine.load()
    except Exception as exc:
        logger.warning("using MockWhisperEngine (%s)", exc)
        _engine = MockWhisperEngine()
    return _engine


def set_engine(engine) -> None:
    """Override the engine (used by tests)."""
    global _engine
    _engine = engine


def model_source() -> str:
    """Where the configured model name came from."""
    return "env:WHISPER_MODEL" if os.environ.get("WHISPER_MODEL") else "code-default"


def engine_status() -> dict:
    """Report configured vs actually-loaded engine.

    Deliberately does NOT load the model: a status call must never trigger a
    multi-gigabyte download. `loaded` is False until the first transcription.
    """
    device, compute_type = _pick_device()
    status = {
        "configured_model": DEFAULT_MODEL,
        "model_source": model_source(),
        "fallback_chain": list(dict.fromkeys(FALLBACK_CHAIN)),
        "device": device,
        "compute_type": compute_type,
        "loaded": _engine is not None,
        "loaded_model": None,
        "is_mock": None,
        "degraded": None,
    }
    if _engine is not None:
        status["loaded_model"] = getattr(_engine, "model_size", "unknown")
        status["device"] = getattr(_engine, "device", device)
        status["compute_type"] = getattr(_engine, "compute_type", compute_type)
        status["is_mock"] = getattr(_engine, "is_mock", True)
        status["degraded"] = getattr(_engine, "degraded", False)
    return status


def log_engine_configuration() -> None:
    """One greppable WARNING line at boot stating what will load.

    The model itself loads lazily on the first transcription, so at boot this
    is the configured intent; the matching 'WHISPER ENGINE LOADED' line reports
    what actually loaded.
    """
    device, compute_type = _pick_device()
    logger.warning(
        "WHISPER ENGINE CONFIGURED: model=%s source=%s device=%s compute_type=%s "
        "fallback=%s (loads lazily on first transcription)",
        DEFAULT_MODEL,
        model_source(),
        device,
        compute_type,
        "->".join(dict.fromkeys(FALLBACK_CHAIN)),
    )
