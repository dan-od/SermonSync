"""Engine version + pipeline configuration reporting (SS-049).

Reports the engine version string and the *configured* pipeline (without forcing
heavy model loads), so the frontend can show ENGINE vX and track which models /
stages are active.
"""

from __future__ import annotations

import importlib.util
import os

ENGINE_NAME = "sermonsync-ai"
ENGINE_VERSION = "3.1.0-fsq"


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):  # pragma: no cover
        return False


def pipeline_config() -> dict:
    """Introspect the configured pipeline without loading models."""
    from engine.matching.orchestrator import PipelineThresholds
    from engine.transcription.whisper_engine import (
        DEFAULT_MODEL,
        _pick_device,
        engine_status,
    )

    device, compute_type = _pick_device()
    whisper = engine_status()
    llm_model_path = os.environ.get("LLM_MODEL_PATH")
    thresholds = PipelineThresholds()

    return {
        "engine": ENGINE_NAME,
        "version": ENGINE_VERSION,
        "transcription": {
            "backend": "faster-whisper",
            # `model` is the configured name (unchanged for existing callers);
            # loaded_model is what is actually running, and differs whenever
            # the fallback chain fired.
            "model": DEFAULT_MODEL,
            "device": whisper["device"],
            "compute_type": whisper["compute_type"],
            "model_source": whisper["model_source"],
            "loaded": whisper["loaded"],
            "loaded_model": whisper["loaded_model"],
            "degraded": whisper["degraded"],
        },
        "matching": {
            "stage_count": 4,
            "stages": [
                {"stage": 1, "name": "Explicit Trie", "backend": "trie"},
                {"stage": 2, "name": "Keyword Index", "backend": "bm25"},
                {
                    "stage": 3,
                    "name": "Contextual LLM",
                    "backend": "llama.cpp" if llm_model_path else "mock",
                    "model_path": llm_model_path,
                },
                {
                    "stage": 4,
                    "name": "Neural Match",
                    "backend": "sentence-transformers"
                    if _module_available("sentence_transformers")
                    else "mock",
                    "store": "chromadb",
                },
            ],
            "thresholds": {
                "trie": thresholds.trie,
                "keyword": thresholds.keyword,
                "llm": thresholds.llm,
            },
        },
    }
