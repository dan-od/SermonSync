"""Multi-backend Whisper transcription engine (SS-013 / SS-066).

Mac (Apple Silicon): mlx-whisper — Metal-native, no CTranslate2 needed.
Windows/Linux (CUDA): faster-whisper — CTranslate2, auto-picks compute_type
    per GPU via ctranslate2.get_supported_compute_types().

Model selection priority:
    1. env WHISPER_MODEL (set by Tauri or operator)
    2. settings store key "whisper.model" (persisted by the Settings UI)
    3. code default "large-v3-turbo"

If neither backend nor any model loads, a MockWhisperEngine returns
deterministic dummy text so the rest of the pipeline keeps working.
"""

from __future__ import annotations

import logging
import math
import os
import sys

logger = logging.getLogger("sermonsync.transcription.whisper")

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

CODE_DEFAULT_MODEL = "large-v3-turbo"

# HuggingFace repo IDs for mlx-whisper (mlx-community quantised checkpoints).
_MLX_MODEL_MAP: dict[str, str] = {
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
    "large-v3": "mlx-community/whisper-large-v3-mlx",
    "large-v2": "mlx-community/whisper-large-v2-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "small": "mlx-community/whisper-small-mlx",
    "base": "mlx-community/whisper-base-mlx",
    "tiny": "mlx-community/whisper-tiny-mlx",
}


def _is_apple_silicon() -> bool:
    import platform
    return sys.platform == "darwin" and platform.machine() == "arm64"


def _configured_model() -> str:
    """Read model name from env, then settings store, then code default."""
    env = os.environ.get("WHISPER_MODEL")
    if env:
        return env
    try:
        from engine.config.store import get_store
        stored = get_store().get_setting("whisper.model")
        if stored:
            return stored
    except Exception:
        pass
    return CODE_DEFAULT_MODEL


def _model_source() -> str:
    if os.environ.get("WHISPER_MODEL"):
        return "env:WHISPER_MODEL"
    try:
        from engine.config.store import get_store
        if get_store().get_setting("whisper.model"):
            return "settings:whisper.model"
    except Exception:
        pass
    return "code-default"


def _build_fallback_chain(primary: str) -> list[str]:
    chain = [primary]
    for fallback in ("base", "tiny"):
        if fallback not in chain:
            chain.append(fallback)
    return chain


# ---------------------------------------------------------------------------
# Backend: faster-whisper (Windows / Linux CUDA, or Mac CPU fallback)
# ---------------------------------------------------------------------------

def _pick_device_faster_whisper() -> tuple[str, str]:
    """Return (device, compute_type) with per-GPU compute_type selection.

    Priority: int8_float16 > float16 > int8 > auto (CPU fallback).
    GTX 1660 lacks tensor cores so float16 is slow; int8_float16 is safe.
    """
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            supported = set(ctranslate2.get_supported_compute_types("cuda"))
            for preferred in ("int8_float16", "float16", "int8"):
                if preferred in supported:
                    return "cuda", preferred
            return "cuda", "auto"
    except Exception:
        pass
    return "cpu", "int8"


def _check_cuda_deps() -> list[str]:
    """On Windows, verify CUDA/cuDNN DLLs are loadable. Returns missing libs."""
    if sys.platform != "win32":
        return []
    missing = []
    import ctypes
    for dll in ("nvcuda.dll", "cudnn64_9.dll", "cublas64_12.dll", "cublasLt64_12.dll"):
        try:
            ctypes.WinDLL(dll)
        except OSError:
            missing.append(dll)
    return missing


# ---------------------------------------------------------------------------
# Engine classes
# ---------------------------------------------------------------------------

class MockWhisperEngine:
    """Stand-in that returns deterministic dummy text (no model needed)."""

    is_mock = True
    model_size = "mock"
    device = "cpu"
    compute_type = "n/a"
    backend = "mock"

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


class FasterWhisperEngine:
    """CTranslate2-backed engine for Windows/Linux CUDA and CPU fallback."""

    is_mock = False
    backend = "faster-whisper"

    def __init__(self, model_size: str, device: str, compute_type: str, model) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = model
        self.requested_model = model_size
        self.degraded = False

    @classmethod
    def load(cls, candidates: list[str] | None = None) -> FasterWhisperEngine:
        from faster_whisper import WhisperModel

        if sys.platform == "win32":
            missing = _check_cuda_deps()
            if missing:
                raise RuntimeError(
                    f"CUDA/cuDNN libraries missing: {', '.join(missing)}. "
                    "Install CUDA Toolkit 12.x and cuDNN 9.x, or the model "
                    "will not load on GPU. https://developer.nvidia.com/cudnn"
                )

        device, compute_type = _pick_device_faster_whisper()
        chain = candidates or _build_fallback_chain(_configured_model())
        requested = chain[0]
        tried: list[str] = []
        for size in chain:
            if size in tried:
                continue
            tried.append(size)
            try:
                logger.info("loading Whisper model '%s' on %s/%s", size, device, compute_type)
                model = WhisperModel(size, device=device, compute_type=compute_type)
                degraded = size != requested
                logger.warning(
                    "WHISPER ENGINE LOADED: backend=faster-whisper model=%s "
                    "device=%s compute_type=%s%s",
                    size, device, compute_type,
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
        segments, info = self._model.transcribe(
            audio,
            language=language,
            beam_size=1,
            vad_filter=False,
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


class MLXWhisperEngine:
    """Apple Metal-native engine via mlx-whisper."""

    is_mock = False
    backend = "mlx-whisper"
    device = "metal"
    compute_type = "float16"

    def __init__(self, model_size: str, hf_repo: str) -> None:
        self.model_size = model_size
        self._hf_repo = hf_repo
        self.requested_model = model_size
        self.degraded = False

    @classmethod
    def load(cls, candidates: list[str] | None = None) -> MLXWhisperEngine:
        import mlx_whisper  # noqa: F401 — verify import works

        chain = candidates or _build_fallback_chain(_configured_model())
        requested = chain[0]
        tried: list[str] = []
        for size in chain:
            if size in tried:
                continue
            tried.append(size)
            hf_repo = _MLX_MODEL_MAP.get(size)
            if not hf_repo:
                logger.warning("no mlx-whisper mapping for model '%s'", size)
                continue
            try:
                logger.info("loading mlx-whisper model '%s' (%s)", size, hf_repo)
                # Warm-load: transcribe a tiny silent buffer to force weight download
                # and compilation now, not on the first real utterance.
                _warm = np.zeros(16000, dtype="float32") if np is not None else []
                mlx_whisper.transcribe(
                    _warm, path_or_hf_repo=hf_repo, language="en",
                    word_timestamps=False,
                )
                degraded = size != requested
                logger.warning(
                    "WHISPER ENGINE LOADED: backend=mlx-whisper model=%s "
                    "device=metal compute_type=float16%s",
                    size,
                    f" (DEGRADED - requested '{requested}' failed)" if degraded else "",
                )
                engine = cls(size, hf_repo)
                engine.requested_model = requested
                engine.degraded = degraded
                return engine
            except Exception as exc:
                logger.warning("failed to load mlx-whisper '%s': %s", size, exc)
        raise RuntimeError(f"no mlx-whisper model could be loaded (tried {tried})")

    def transcribe(self, audio, language: str | None = None) -> list[dict]:
        import mlx_whisper

        result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=self._hf_repo,
            language=language or "en",
            word_timestamps=False,
        )
        segments = result.get("segments", [])
        results = []
        for seg in segments:
            results.append(
                {
                    "text": seg.get("text", "").strip(),
                    "start": round(seg.get("start", 0.0), 3),
                    "end": round(seg.get("end", 0.0), 3),
                    "confidence": _logprob_to_confidence(seg.get("avg_logprob", -1.0)),
                    "no_speech_prob": round(seg.get("no_speech_prob", 0.0), 4),
                    "language": language or result.get("language", "en"),
                }
            )
        return results


# Keep the old class name as an alias for backwards compatibility with tests.
WhisperEngine = FasterWhisperEngine


def _logprob_to_confidence(avg_logprob: float) -> float:
    return round(max(0.0, min(1.0, math.exp(avg_logprob))), 4)


# ---------------------------------------------------------------------------
# Process-wide singleton
# ---------------------------------------------------------------------------

_engine = None


def _select_backend() -> str:
    """Pick the best available backend for this platform."""
    if _is_apple_silicon():
        try:
            import mlx_whisper  # noqa: F401
            return "mlx-whisper"
        except ImportError:
            logger.info("mlx-whisper not installed, falling back to faster-whisper")
    return "faster-whisper"


def get_engine():
    """Return the process-wide engine, loading it (or a mock) on first use."""
    global _engine
    if _engine is not None:
        return _engine
    try:
        backend = _select_backend()
        if backend == "mlx-whisper":
            _engine = MLXWhisperEngine.load()
        else:
            _engine = FasterWhisperEngine.load()
    except Exception as exc:
        logger.warning("using MockWhisperEngine (%s)", exc)
        _engine = MockWhisperEngine()
    return _engine


def set_engine(engine) -> None:
    """Override the engine (used by tests)."""
    global _engine
    _engine = engine


def model_source() -> str:
    return _model_source()


def engine_status() -> dict:
    """Report configured vs actually-loaded engine.

    Deliberately does NOT load the model: a status call must never trigger a
    multi-gigabyte download. `loaded` is False until the first transcription.
    """
    configured = _configured_model()
    source = _model_source()
    chain = _build_fallback_chain(configured)
    backend = _select_backend()

    if backend == "mlx-whisper":
        device, compute_type = "metal", "float16"
    else:
        device, compute_type = _pick_device_faster_whisper()

    status = {
        "backend": backend,
        "configured_model": configured,
        "model_source": source,
        "fallback_chain": chain,
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
        status["backend"] = getattr(_engine, "backend", backend)
    return status


def log_engine_configuration() -> None:
    """One greppable WARNING line at boot stating what will load."""
    configured = _configured_model()
    source = _model_source()
    backend = _select_backend()
    chain = _build_fallback_chain(configured)

    if backend == "mlx-whisper":
        device, compute_type = "metal", "float16"
    else:
        device, compute_type = _pick_device_faster_whisper()

    logger.warning(
        "WHISPER ENGINE CONFIGURED: backend=%s model=%s source=%s device=%s "
        "compute_type=%s fallback=%s",
        backend, configured, source, device, compute_type,
        "->".join(chain),
    )
