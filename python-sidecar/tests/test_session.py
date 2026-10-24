"""Unit tests for session management + persistence (SS-044)."""

from __future__ import annotations

import pytest
from database import get_app_connection
from engine.session.manager import SessionManager


@pytest.fixture
def mgr(tmp_path):
    return SessionManager(db_path=str(tmp_path / "app.db"))


def test_start_creates_active_session(mgr):
    s = mgr.start(unit_id="FSQ-PH-MGBUOGBA-01", unit_name="Mgbuogba")
    assert s["status"] == "active"
    assert s["unit_id"] == "FSQ-PH-MGBUOGBA-01"
    assert s["id"].startswith("sess_")
    assert mgr.current()["id"] == s["id"]


def test_end_marks_ended_and_sets_elapsed(mgr):
    mgr.start()
    ended = mgr.end()
    assert ended["status"] == "ended"
    assert ended["ended_at"] is not None
    assert ended["elapsed_seconds"] >= 0
    assert mgr.current() is None


def test_starting_again_ends_previous(mgr):
    first = mgr.start()
    second = mgr.start()
    assert first["id"] != second["id"]
    assert mgr.get(first["id"])["status"] == "ended"
    assert mgr.current()["id"] == second["id"]


def test_end_without_active_returns_none(mgr):
    assert mgr.end() is None


def test_record_event_ties_to_active_session(mgr):
    s = mgr.start()
    mgr.record_event("sentence", {"text": "For God so loved the world."})
    mgr.record_event("suggestion", {"results": [{"reference": "John 3:16"}]})
    events = mgr.events(s["id"])
    assert len(events) == 2
    assert events[0]["kind"] == "sentence"
    assert events[0]["payload"]["text"] == "For God so loved the world."
    assert mgr.get(s["id"])["event_count"] == 2


def test_record_event_outside_session_is_noop(mgr):
    mgr.record_event("sentence", {"text": "orphan"})  # no active session
    assert mgr.history() == []


def test_history_newest_first(mgr):
    a = mgr.start()
    mgr.end()
    b = mgr.start()
    hist = mgr.history()
    assert [h["id"] for h in hist][:2] == [b["id"], a["id"]]


def test_restart_archives_interrupted_session_and_waits_for_manual_start(tmp_path):
    path = str(tmp_path / "app.db")
    m1 = SessionManager(db_path=path)
    s = m1.start(unit_name="Test Unit")
    m1.record_event("sentence", {"text": "persisted"})

    # A new app run keeps the archive but never resumes the old session.
    m2 = SessionManager(db_path=path)
    assert m2.current() is None
    assert m2.get(s["id"])["status"] == "ended"
    assert m2.get(s["id"])["ended_at"] is not None
    assert m2.events(s["id"])[0]["payload"]["text"] == "persisted"

    new_session = m2.start(unit_name="Next Unit")
    assert new_session["id"] != s["id"]
    assert new_session["elapsed_seconds"] == 0
    assert m2.current()["id"] == new_session["id"]


def test_restart_archives_every_interrupted_session(tmp_path):
    path = str(tmp_path / "app.db")
    first = SessionManager(db_path=path).start()
    conn = get_app_connection(path)
    try:
        conn.execute(
            "INSERT INTO sessions (id, status, started_at) VALUES (?, 'active', ?)",
            ("another_interrupted_session", first["started_at"]),
        )
        conn.commit()
    finally:
        conn.close()
    restarted = SessionManager(db_path=path)

    assert restarted.current() is None
    assert restarted.get(first["id"])["status"] == "ended"
    assert restarted.get("another_interrupted_session")["status"] == "ended"


def test_elapsed_grows_for_active(mgr, monkeypatch):
    base = 1_000_000.0
    monkeypatch.setattr(SessionManager, "_now", staticmethod(lambda: base))
    s = mgr.start()
    monkeypatch.setattr(SessionManager, "_now", staticmethod(lambda: base + 42))
    assert mgr.get(s["id"])["elapsed_seconds"] == 42
