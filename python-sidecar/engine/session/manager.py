"""Session management + persistence (SS-044).

A session encapsulates one service/sermon. It has a lifecycle (active → ended),
an elapsed timer (derived from started_at), and every transcript / suggestion /
operator action is tied to it and persisted for the archive (SS-045).

State lives in the writable app DB (data/app.db), separate from the read-only
Bible DB.
"""

from __future__ import annotations

import json
import logging
import time
import uuid

from database import get_app_connection

logger = logging.getLogger("sermonsync.session")

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id               TEXT PRIMARY KEY,
    unit_id          TEXT,
    unit_name        TEXT,
    status           TEXT NOT NULL,          -- active | ended
    started_at       REAL NOT NULL,          -- epoch seconds
    ended_at         REAL,
    elapsed_seconds  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS session_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,               -- transcript | sentence | suggestion | action
    payload     TEXT NOT NULL,               -- JSON
    created_at  REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_session
    ON session_events(session_id, created_at);
"""


class SessionManager:
    def __init__(self, db_path: str | None = None) -> None:
        self._db_path = db_path
        self._current_id: str | None = None
        self._ensure_schema()
        self._recover_active()

    # ------------------------------------------------------------------
    def _conn(self):
        return get_app_connection(self._db_path)

    def _ensure_schema(self) -> None:
        conn = self._conn()
        try:
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()

    def _recover_active(self) -> None:
        """On startup, re-attach to an active session if one was left open."""
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT id FROM sessions WHERE status = 'active' "
                "ORDER BY started_at DESC LIMIT 1"
            ).fetchone()
            self._current_id = row["id"] if row else None
        finally:
            conn.close()

    # ------------------------------------------------------------------
    @staticmethod
    def _now() -> float:
        return time.time()

    def _row_to_dict(self, row) -> dict:
        started = row["started_at"]
        ended = row["ended_at"]
        elapsed = (
            row["elapsed_seconds"]
            if row["status"] == "ended"
            else int(self._now() - started)
        )
        return {
            "id": row["id"],
            "unit_id": row["unit_id"],
            "unit_name": row["unit_name"],
            "status": row["status"],
            "started_at": started,
            "ended_at": ended,
            "elapsed_seconds": max(0, elapsed),
        }

    # ------------------------------------------------------------------
    def start(self, unit_id: str | None = None, unit_name: str | None = None) -> dict:
        """Start a new session. Ends any currently-active one first."""
        if self._current_id is not None:
            self.end()

        session_id = f"sess_{int(self._now())}_{uuid.uuid4().hex[:8]}"
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO sessions "
                "(id, unit_id, unit_name, status, started_at) "
                "VALUES (?, ?, ?, 'active', ?)",
                (session_id, unit_id, unit_name, self._now()),
            )
            conn.commit()
        finally:
            conn.close()
        self._current_id = session_id
        logger.info("session started: %s (unit=%s)", session_id, unit_id)
        return self.get(session_id)

    def end(self) -> dict | None:
        """End the active session; returns the ended session or None."""
        if self._current_id is None:
            return None
        session_id = self._current_id
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT started_at FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                self._current_id = None
                return None
            elapsed = int(self._now() - row["started_at"])
            conn.execute(
                "UPDATE sessions SET status = 'ended', ended_at = ?, "
                "elapsed_seconds = ? WHERE id = ?",
                (self._now(), max(0, elapsed), session_id),
            )
            conn.commit()
        finally:
            conn.close()
        self._current_id = None
        logger.info("session ended: %s (%ds)", session_id, elapsed)
        return self.get(session_id)

    def current(self) -> dict | None:
        if self._current_id is None:
            return None
        return self.get(self._current_id)

    @property
    def current_id(self) -> str | None:
        return self._current_id

    def get(self, session_id: str) -> dict | None:
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                return None
            result = self._row_to_dict(row)
            result["event_count"] = conn.execute(
                "SELECT COUNT(*) AS c FROM session_events WHERE session_id = ?",
                (session_id,),
            ).fetchone()["c"]
            return result
        finally:
            conn.close()

    def history(self, limit: int = 50) -> list[dict]:
        conn = self._conn()
        try:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [self._row_to_dict(r) for r in rows]
        finally:
            conn.close()

    def record_event(self, kind: str, payload: dict) -> None:
        """Tie a transcript/sentence/suggestion/action to the active session."""
        if self._current_id is None:
            return  # nothing recorded outside a session
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO session_events (session_id, kind, payload, created_at) "
                "VALUES (?, ?, ?, ?)",
                (self._current_id, kind, json.dumps(payload), self._now()),
            )
            conn.commit()
        except Exception as exc:  # pragma: no cover - never break the pipeline
            logger.error("failed to record %s event: %s", kind, exc)
        finally:
            conn.close()

    def events(self, session_id: str, kind: str | None = None) -> list[dict]:
        conn = self._conn()
        try:
            if kind:
                rows = conn.execute(
                    "SELECT kind, payload, created_at FROM session_events "
                    "WHERE session_id = ? AND kind = ? ORDER BY created_at",
                    (session_id, kind),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT kind, payload, created_at FROM session_events "
                    "WHERE session_id = ? ORDER BY created_at",
                    (session_id,),
                ).fetchall()
            return [
                {
                    "kind": r["kind"],
                    "payload": json.loads(r["payload"]),
                    "created_at": r["created_at"],
                }
                for r in rows
            ]
        finally:
            conn.close()


_manager: SessionManager | None = None


def get_manager() -> SessionManager:
    global _manager
    if _manager is None:
        _manager = SessionManager()
    return _manager


def set_manager(manager: SessionManager | None) -> None:
    global _manager
    _manager = manager
