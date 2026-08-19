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
