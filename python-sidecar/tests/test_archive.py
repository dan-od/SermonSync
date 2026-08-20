"""Unit tests for the sermon archive / history (SS-045)."""

from __future__ import annotations

import pytest
from engine.session.manager import SessionManager


@pytest.fixture
def mgr(tmp_path):
    return SessionManager(db_path=str(tmp_path / "app.db"))


def _populate(mgr):
    s = mgr.start(unit_name="Mgbuogba")
    mgr.record_event("sentence", {"text": "For God so loved the world."})
    mgr.record_event("sentence", {"text": "The Lord is my shepherd."})
    mgr.record_event("suggestion", {"results": [{"reference": "John 3:16"}]})
    mgr.record_event("action", {"action": "sent", "reference": "John 3:16"})
    mgr.end()
    return s["id"]


def test_full_archive_groups_events(mgr):
    sid = _populate(mgr)
    archive = mgr.full_archive(sid)
    assert archive["session"]["status"] == "ended"
    assert len(archive["transcript"]) == 2
    assert len(archive["suggestions"]) == 1
    assert len(archive["actions"]) == 1
    assert archive["actions"][0]["payload"]["action"] == "sent"


def test_full_archive_unknown_returns_none(mgr):
    assert mgr.full_archive("nope") is None


def test_archive_summary_totals(mgr, monkeypatch):
    base = 1_000_000.0
    monkeypatch.setattr(SessionManager, "_now", staticmethod(lambda: base))
    mgr.start()
    monkeypatch.setattr(SessionManager, "_now", staticmethod(lambda: base + 600))  # 10 min
    mgr.end()
    summary = mgr.archive_summary()
    assert summary["session_count"] == 1
    assert summary["total_seconds"] == 600


def test_search_transcripts_finds_text(mgr):
    _populate(mgr)
    hits = mgr.search_transcripts("shepherd")
    assert len(hits) == 1
    assert "shepherd" in hits[0]["text"].lower()


def test_search_transcripts_case_insensitive_and_empty(mgr):
    _populate(mgr)
    assert len(mgr.search_transcripts("GOD")) == 1
    assert mgr.search_transcripts("nonexistentword") == []
