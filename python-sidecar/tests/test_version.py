"""Unit tests for engine version / pipeline config reporting (SS-049)."""

from __future__ import annotations

from engine.version import ENGINE_VERSION, pipeline_config


def test_version_shape():
    cfg = pipeline_config()
    assert cfg["engine"] == "sermonsync-ai"
    assert cfg["version"] == ENGINE_VERSION
    assert cfg["transcription"]["backend"] == "faster-whisper"
    assert cfg["matching"]["stage_count"] == 4
    assert len(cfg["matching"]["stages"]) == 4
    # thresholds present and ordered
    t = cfg["matching"]["thresholds"]
    assert t["trie"] > t["keyword"] > t["llm"]


def test_stage_names():
    stages = pipeline_config()["matching"]["stages"]
    assert [s["stage"] for s in stages] == [1, 2, 3, 4]
    assert stages[0]["name"] == "Explicit Trie"
    assert stages[3]["store"] == "chromadb"


# --- SS-065: configured vs loaded visibility ------------------------------
def test_engine_status_does_not_load_the_model():
    """A status probe must never trigger a multi-gigabyte download."""
    from engine.transcription import whisper_engine

    whisper_engine.set_engine(None)
    status = whisper_engine.engine_status()
    assert status["loaded"] is False
    assert status["loaded_model"] is None
    assert whisper_engine._engine is None  # still not loaded
    assert status["configured_model"] == whisper_engine.DEFAULT_MODEL
    assert status["device"] in {"cpu", "cuda"}
    assert status["compute_type"] in {"int8", "float16"}


def test_engine_status_reports_the_loaded_model(monkeypatch):
    from engine.transcription import whisper_engine

    class FakeEngine:
        model_size = "tiny"
        device = "cuda"
        compute_type = "float16"
        is_mock = False
        degraded = True

    whisper_engine.set_engine(FakeEngine())
    try:
        status = whisper_engine.engine_status()
        assert status["loaded"] is True
        assert status["loaded_model"] == "tiny"
        assert status["device"] == "cuda"
        assert status["compute_type"] == "float16"
        assert status["degraded"] is True
    finally:
        whisper_engine.set_engine(None)


def test_model_source_distinguishes_env_from_default(monkeypatch):
    from engine.transcription import whisper_engine

    monkeypatch.delenv("WHISPER_MODEL", raising=False)
    assert whisper_engine.model_source() == "code-default"
    monkeypatch.setenv("WHISPER_MODEL", "large-v3-turbo")
    assert whisper_engine.model_source() == "env:WHISPER_MODEL"


def test_pipeline_config_exposes_configured_and_loaded():
    cfg = pipeline_config()["transcription"]
    for key in ("model", "loaded", "loaded_model", "device", "compute_type", "model_source"):
        assert key in cfg, key


def test_boot_log_states_model_device_and_compute(caplog):
    """One greppable WARNING line at boot naming what will load."""
    import logging

    from engine.transcription.whisper_engine import log_engine_configuration

    with caplog.at_level(logging.WARNING):
        log_engine_configuration()
    lines = [
        r.getMessage()
        for r in caplog.records
        if "WHISPER ENGINE CONFIGURED" in r.getMessage()
    ]
    assert len(lines) == 1
    line = lines[0]
    assert "model=" in line and "device=" in line and "compute_type=" in line
