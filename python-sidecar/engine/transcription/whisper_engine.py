"""Multi-backend Whisper transcription engine (SS-013 / SS-066).

Mac (Apple Silicon): mlx-whisper — Metal-native, no CTranslate2 needed.
Windows/Linux (CUDA): faster-whisper — CTranslate2, auto-picks compute_type
    per GPU via ctranslate2.get_supported_compute_types().

Model selection priority:
    1. env WHISPER_MODEL (set by Tauri or operator)
    2. settings store key "whisper.model" (persisted by the Settings UI)
    3. code default "large-v3-turbo"

A machine without usable CUDA runs faster-whisper on CPU. If no model loads at
all, get_engine() raises and transcription stops with an error: a live service
must never receive fake transcripts, so MockWhisperEngine is for tests only
(SERMONSYNC_TEST=1 or pytest).
"""

from __future__ import annotations

import importlib.util
import logging
import math
import os
import statistics
import sys

logger = logging.getLogger("sermonsync.transcription.whisper")

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None

CODE_DEFAULT_MODEL = "large-v3-turbo"
# SS-078: the model to suggest when the chosen one cannot keep up on CPU.
# NOT a default. Measured over the same 420 s sermon (eval_runs/20261107-23*),
# CPU int8, finals only:
#
#   model            speech->final p50   WER      spoken-ref recall
#   large-v3-turbo              4.85 s   0.0548   100%
#   medium                      3.97 s   0.1322    66.7% (precision 50%)
#   small                       1.64 s   0.1430    33.3%
#
# Dropping to "small" does hit the latency targets, and costs 7.3 points of
# WER and two thirds of Stage 0's recall — against a 2-point regression bar.
# "medium" is the worst of both. This is the garbling SS-066 moved off `base`
# to escape, and in spoken_only mode Stage 0's recall is the whole pipeline's
# recall, so a faster transcript that loses the references is not a trade
# worth making silently. Turbo stays the default everywhere; the operator is
# told when it is too slow for their machine and can choose this instead.
CPU_DEFAULT_MODEL = "small"
# Above this, inference cannot keep up with the speaker and latency grows
# without bound. Reported, never acted on: switching models mid-service would
# drop the stream.
RTF_WARNING_THRESHOLD = 0.6

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


def _accelerated() -> bool:
    """True when a GPU backend will actually carry the inference."""
    if _is_apple_silicon() and importlib.util.find_spec("mlx_whisper") is not None:
        return True
    try:
        return _pick_device_faster_whisper()[0] != "cpu"
    except Exception:
        return False


def _code_default_model() -> str:
    """The default model. One model everywhere: see CPU_DEFAULT_MODEL for the
    measurements behind not varying it by device."""
    return CODE_DEFAULT_MODEL


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
    return _code_default_model()


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
    # SS-078: "small" sits between turbo and base, so a CPU default of "small"
    # can still fall back, and a turbo box degrades through it rather than
    # straight to base.
    for fallback in ("small", "base", "tiny"):
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
    missing = _check_cuda_deps()
    if missing:
        logger.debug("CUDA libraries missing: %s", ", ".join(missing))
        return "cpu", "int8"
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


# Decoding options, backend-agnostic in spirit: each backend maps what it
# supports. beam_size stays 1 everywhere — mlx-whisper has no beam search, so
# this keeps Mac results comparable with the Windows (faster-whisper) target.
# condition_on_previous_text only links 30 s windows inside one call; our
# chunks are a few seconds, so it never applied, but say so explicitly.
# The full ladder, for offline/eval use where accuracy outranks latency.
OFFLINE_TEMPERATURES = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]

DEFAULT_DECODE_OPTIONS = {
    "beam_size": 1,
    "condition_on_previous_text": False,
    # SS-078: live decoding gets one retry, not five. Whisper re-decodes the
    # whole chunk at the next temperature whenever the compression-ratio or
    # logprob check fails, and on noisy church audio that fires often — each
    # retry is another full pass sitting on the latency path. The full ladder
    # stays available for offline scoring via OFFLINE_TEMPERATURES, where wall
    # clock does not matter.
    "temperature": [0.0, 0.4],
    "compression_ratio_threshold": 2.4,
    "log_prob_threshold": -1.0,
    "no_speech_threshold": 0.6,
}


def _logprob_to_confidence(avg_logprob: float) -> float:
    return round(max(0.0, min(1.0, math.exp(avg_logprob))), 4)


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

    def transcribe(self, audio, language: str | None = None, **hints) -> list[dict]:
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
        # Set by load(); the requested model differs from model_size whenever
        # the fallback chain kicked in.
        self.requested_model = model_size
        self.degraded = False
        self.decode_options = dict(DEFAULT_DECODE_OPTIONS)

    @classmethod
    def load(cls, candidates: list[str] | None = None) -> FasterWhisperEngine:
        from faster_whisper import WhisperModel

        device, compute_type = _pick_device_faster_whisper()
        if device == "cpu" and sys.platform != "darwin":
            logger.warning("No CUDA found — running Whisper on CPU (slower but functional)")
        chain = candidates or _build_fallback_chain(_configured_model())
        requested = chain[0]
        # A broken GPU setup can pass the checks above and still fail to load,
        # so CUDA always gets a CPU attempt behind it.
        attempts = [(device, compute_type)]
        if device != "cpu":
            attempts.append(("cpu", "int8"))
        for device, compute_type in attempts:
            tried: list[str] = []
            for size in chain:
                if size in tried:
                    continue
                tried.append(size)
                try:
                    logger.info("loading Whisper model '%s' on %s/%s", size, device, compute_type)
                    bundled = os.environ.get("SERMONSYNC_WHISPER_DIR")
                    kwargs = (
                        {"download_root": bundled, "local_files_only": size == "base"}
                        if bundled else {}
                    )
                    try:
                        # Cached models must load without touching the network: an
                        # unreachable Hugging Face otherwise stalls sidecar startup.
                        local_kwargs = {**kwargs, "local_files_only": True}
                        model = WhisperModel(
                            size, device=device, compute_type=compute_type, **local_kwargs
                        )
                    except Exception:
                        if kwargs.get("local_files_only"):
                            raise
                        model = WhisperModel(
                            size, device=device, compute_type=compute_type, **kwargs
                        )
                    degraded = size != requested
                    # WARNING so the operator can grep one line for the truth. A
                    # silent fallback to a smaller model is the failure mode this
                    # exists to expose.
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
        raise RuntimeError(f"no Whisper model could be loaded (tried {chain})")

    def transcribe(
        self,
        audio,
        language: str | None = None,
        prompt: str | None = None,
        hotwords: str | None = None,
    ) -> list[dict]:
        """Transcribe a float32 mono 16 kHz buffer; returns segment dicts.

        `prompt` becomes Whisper's initial_prompt: it copies the prompt's
        style and spelling (it does not follow instructions in it).
        `hotwords` is faster-whisper's lighter-weight bias for the same text.
        """
        options = dict(self.decode_options)
        if prompt:
            options["initial_prompt"] = prompt
        if hotwords:
            options["hotwords"] = hotwords
        segments, info = self._model.transcribe(
            audio,
            language=language,
            vad_filter=False,  # our own VAD already gates the stream
            **options,
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
                    "avg_logprob": round(seg.avg_logprob, 4),
                    "compression_ratio": round(seg.compression_ratio, 3),
                    # SS-078: which temperature finally decoded this segment.
                    # Anything above the first rung means the decode was retried.
                    "temperature": getattr(seg, "temperature", None),
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
        self.decode_options = dict(DEFAULT_DECODE_OPTIONS)

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

    def transcribe(
        self,
        audio,
        language: str | None = None,
        prompt: str | None = None,
        hotwords: str | None = None,
    ) -> list[dict]:
        """Same contract as FasterWhisperEngine.transcribe. mlx-whisper has no
        hotwords and no beam search, so `hotwords` is ignored and beam_size is
        not passed; log_prob_threshold is spelled logprob_threshold there."""
        import mlx_whisper

        options = dict(self.decode_options)
        options.pop("beam_size", None)
        options["logprob_threshold"] = options.pop("log_prob_threshold")
        options["temperature"] = tuple(options["temperature"])
        if prompt:
            options["initial_prompt"] = prompt
        result = mlx_whisper.transcribe(
            audio,
            path_or_hf_repo=self._hf_repo,
            language=language or "en",
            word_timestamps=False,
            **options,
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
                    "avg_logprob": round(seg.get("avg_logprob", -1.0), 4),
                    "compression_ratio": round(seg.get("compression_ratio", 0.0), 3),
                    "language": language or result.get("language", "en"),
                }
            )
        return results


# Keep the old class name as an alias for backwards compatibility with tests.
WhisperEngine = FasterWhisperEngine


# ---------------------------------------------------------------------------
# Process-wide singleton
# ---------------------------------------------------------------------------

_engine = None
_engine_error: str | None = None
_partial_engines: dict[str, object] = {}

# Models the interim ("partial") passes may use instead of the main model.
PARTIAL_MODELS = ("tiny.en", "base.en")


def get_partial_engine(model: str):
    """A small model for interim passes (SS-067 groundwork). Loads lazily on
    the main engine's device; falls back to the main engine if it fails."""
    if model not in PARTIAL_MODELS:
        raise ValueError(f"unsupported partial model {model!r}")
    engine = _partial_engines.get(model)
    if engine is None:
        try:
            engine = WhisperEngine.load([model])
        except Exception as exc:
            logger.warning("partial model %s unavailable (%s); using main model", model, exc)
            engine = get_engine()
        _partial_engines[model] = engine
    return engine


def _select_backend() -> str:
    """Pick the best available backend for this platform."""
    if _is_apple_silicon():
        try:
            import mlx_whisper  # noqa: F401
            return "mlx-whisper"
        except ImportError:
            logger.info("mlx-whisper not installed, falling back to faster-whisper")
    return "faster-whisper"


def _mock_allowed() -> bool:
    return os.environ.get("SERMONSYNC_TEST") == "1" or "PYTEST_CURRENT_TEST" in os.environ


def _load_real_engine():
    if _select_backend() == "mlx-whisper":
        try:
            return MLXWhisperEngine.load()
        except Exception as exc:
            logger.warning("mlx-whisper unavailable (%s); trying faster-whisper", exc)
    return FasterWhisperEngine.load()


def get_engine():
    """Return the process-wide engine, loading it on first use.

    Raises RuntimeError if no model can be loaded. The failure is remembered for
    the whole process rather than retried per chunk, since each retry can mean a
    multi-gigabyte download. Only tests fall back to MockWhisperEngine.
    """
    global _engine, _engine_error
    if _engine is not None:
        return _engine
    if _engine_error is not None:
        raise RuntimeError(_engine_error)
    try:
        _engine = _load_real_engine()
    except Exception as exc:
        if _mock_allowed():
            logger.warning("using MockWhisperEngine (%s)", exc)
            _engine = MockWhisperEngine()
            return _engine
        _engine_error = f"no Whisper engine could be loaded: {exc}"
        logger.error("TRANSCRIPTION UNAVAILABLE: %s", _engine_error)
        raise RuntimeError(_engine_error) from exc
    return _engine


def set_engine(engine) -> None:
    """Override the engine (used by tests)."""
    global _engine, _engine_error
    _engine = engine
    _engine_error = None


def model_source() -> str:
    return _model_source()


# SS-078: a short rolling window of realtime factors from live finals, so the
# sidecar can say "this model is too slow for this machine" with a measurement
# instead of a guess. Never acts on it: switching models mid-service would drop
# the stream, and the operator may have chosen this model deliberately.
_rtf_samples: list[float] = []
_rtf_warned = False


def note_inference(infer_ms: float, audio_seconds: float) -> None:
    """Record one final's cost against the audio it covered."""
    if audio_seconds <= 0 or not infer_ms:
        return
    global _rtf_warned
    _rtf_samples.append(infer_ms / (audio_seconds * 1000.0))
    del _rtf_samples[:-20]
    warning = latency_warning()
    if warning and not _rtf_warned:
        _rtf_warned = True
        logger.warning("%s", warning)


def latency_warning() -> str | None:
    """A sentence for the operator, or None when the model is keeping up.

    Needs a few chunks: the first inference carries model-load and warm-up
    cost and would accuse every machine of being slow.
    """
    if len(_rtf_samples) < 3:
        return None
    median = statistics.median(_rtf_samples)
    if median <= RTF_WARNING_THRESHOLD:
        return None
    engine = _engine
    model = getattr(engine, "model_size", None) or _configured_model()
    device = getattr(engine, "device", None) or "cpu"
    # Only worth suggesting on a machine with no GPU to fall back on.
    if _accelerated():
        return (
            f"whisper {model} on {device} is slow (rtf {median:.2f}) — "
            f"the model is not keeping up with the speaker"
        )
    suggestion = CPU_DEFAULT_MODEL if model != CPU_DEFAULT_MODEL else "base"
    return (
        f"whisper {model} on {device} is slow (rtf {median:.2f}) — "
        f"consider '{suggestion}'"
    )


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
        "load_error": _engine_error,
        "latency_warning": latency_warning(),
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
