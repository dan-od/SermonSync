"""Unit tests for latency monitoring / system status (SS-015)."""

from __future__ import annotations

from engine.monitoring import ALERT_THRESHOLD_MS, Monitor


def test_uptime_and_idle():
    m = Monitor()
    s = m.status()
    assert s["uptime_seconds"] >= 0
    assert s["status"] == "idle"
    assert s["latency_ms"] == 0
    assert s["pipeline_stages_healthy"] == [True, True, True, True]


def test_stable_latency():
    m = Monitor()
    m.record_end_to_end(300)
    s = m.status()
    assert s["status"] == "stable"
    assert s["alert"] is False
    assert s["latency_ms"] == 300


def test_alert_on_high_latency():
    m = Monitor()
    m.record_end_to_end(ALERT_THRESHOLD_MS + 500)
    s = m.status()
    assert s["status"] == "alert"
    assert s["alert"] is True


def test_stage_stats_and_health():
    m = Monitor()
    m.record_stage("transcription", 120)
    m.record_stage("transcription", 180)
    assert m.status()["stages"]["transcription"]["avg_ms"] == 150
    m.flag_error("matching")
    s = m.status()
    assert s["stages"]["matching"]["healthy"] is False
    # matching is index 2 in the pipeline health array
    assert s["pipeline_stages_healthy"][2] is False
    m.clear_error("matching")
    assert m.status()["pipeline_stages_healthy"][2] is True
