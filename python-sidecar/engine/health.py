"""Component health + graceful-degradation reporting (SS-055).

Gathers the state of each subsystem WITHOUT forcing heavy model loads, and
classifies overall status. "mock" is a healthy documented fallback (not
degraded); "unavailable"/"error" means a component is down and the pipeline is
running degraded.
"""

from __future__ import annotations

import importlib.util

REAL = "real"
MOCK = "mock"
UNAVAILABLE = "unavailable"


def _available(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):  # pragma: no cover
        return False


def system_health() -> dict:
    from ws_hub import manager

    from engine.audio.devices import backend_available
    from engine.audio.state import audio_state

    components: dict[str, dict] = {}

    # Audio backend (PortAudio)
    components["audio"] = {
        "mode": REAL if backend_available() else UNAVAILABLE,
        "capturing": audio_state.is_capturing,
        "device_index": audio_state.device_index,
    }

    # Transcription (faster-whisper)
    components["transcription"] = {
        "mode": REAL if _available("faster_whisper") else MOCK,
    }

    # Matching stages
    import os
    llm_mode = MOCK
    if os.environ.get("LLM_MODEL_PATH"):
        llm_mode = REAL if _available("llama_cpp") else MOCK
    components["matching"] = {
        "mode": REAL,  # trie + keyword are always real
        "llm": llm_mode,
        "semantic": REAL if _available("sentence_transformers") else MOCK,
        "vector_store": REAL if _available("chromadb") else UNAVAILABLE,
    }

    # WebSocket hub
    components["websocket"] = {"mode": REAL, "clients": manager.client_count}

    degraded = [
        name for name, c in components.items() if c["mode"] == UNAVAILABLE
    ]
    return {
        "status": "degraded" if degraded else "ok",
        "degraded": degraded,
        "components": components,
    }
