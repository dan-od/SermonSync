"""Persistent app config: presets (SS-043), units (SS-046), settings (SS-051).

All in the writable app DB (data/app.db), separate from the read-only Bible DB.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from database import get_app_connection

logger = logging.getLogger("sermonsync.config")

SCHEMA = """
CREATE TABLE IF NOT EXISTS units (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id    TEXT,                          -- NULL = global
    reference  TEXT NOT NULL,                 -- e.g. "Romans 8:28"
    label      TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                       -- JSON
);
"""

DEFAULT_UNIT = ("FSQ-PH-MGBUOGBA-01", "Foursquare Gospel Church, Mgbuogba")
DEFAULT_PRESETS = [
    "Romans 8:28", "Philippians 4:13", "Psalms 27:1", "Matthew 6:33",
    "John 3:16", "Jeremiah 29:11", "Isaiah 41:10", "Proverbs 3:5",
]


class ConfigStore:
    def __init__(self, db_path: str | None = None, seed_defaults: bool = True) -> None:
        self._db_path = db_path
        self._ensure_schema()
        if seed_defaults:
            self._seed_defaults()

    def _conn(self):
        return get_app_connection(self._db_path)

    def _ensure_schema(self) -> None:
        conn = self._conn()
        try:
            conn.executescript(SCHEMA)
            conn.commit()
        finally:
            conn.close()

    def _seed_defaults(self) -> None:
        conn = self._conn()
        try:
            if conn.execute("SELECT COUNT(*) AS c FROM units").fetchone()["c"] == 0:
                conn.execute(
                    "INSERT INTO units (id, name, is_active, created_at) "
                    "VALUES (?, ?, 1, ?)",
                    (DEFAULT_UNIT[0], DEFAULT_UNIT[1], time.time()),
                )
            if conn.execute("SELECT COUNT(*) AS c FROM presets").fetchone()["c"] == 0:
                for pos, ref in enumerate(DEFAULT_PRESETS):
                    conn.execute(
                        "INSERT INTO presets (unit_id, reference, label, position, created_at) "
                        "VALUES (?, ?, NULL, ?, ?)",
                        (DEFAULT_UNIT[0], ref, pos, time.time()),
                    )
            conn.commit()
        finally:
            conn.close()

    # --- Units (SS-046) ------------------------------------------------
    def list_units(self) -> list[dict]:
        conn = self._conn()
        try:
            rows = conn.execute(
                "SELECT id, name, is_active FROM units ORDER BY created_at"
            ).fetchall()
            return [
                {"id": r["id"], "name": r["name"], "is_active": bool(r["is_active"])}
                for r in rows
            ]
        finally:
            conn.close()

    def active_unit(self) -> dict | None:
        conn = self._conn()
        try:
            r = conn.execute(
                "SELECT id, name FROM units WHERE is_active = 1 LIMIT 1"
            ).fetchone()
            return {"id": r["id"], "name": r["name"]} if r else None
        finally:
            conn.close()

    def upsert_unit(self, unit_id: str, name: str) -> dict:
        conn = self._conn()
        try:
            exists = conn.execute(
                "SELECT id FROM units WHERE id = ?", (unit_id,)
            ).fetchone()
            if exists:
                conn.execute("UPDATE units SET name = ? WHERE id = ?", (name, unit_id))
            else:
                conn.execute(
                    "INSERT INTO units (id, name, is_active, created_at) "
                    "VALUES (?, ?, 0, ?)",
                    (unit_id, name, time.time()),
                )
            conn.commit()
        finally:
            conn.close()
        return {"id": unit_id, "name": name}

    def set_active_unit(self, unit_id: str) -> dict:
        conn = self._conn()
        try:
            if conn.execute("SELECT id FROM units WHERE id = ?", (unit_id,)).fetchone() is None:
                raise ValueError(f"unknown unit '{unit_id}'")
            conn.execute("UPDATE units SET is_active = 0")
            conn.execute("UPDATE units SET is_active = 1 WHERE id = ?", (unit_id,))
            conn.commit()
        finally:
            conn.close()
        return {"id": unit_id, "is_active": True}

    # --- Presets (SS-043) ---------------------------------------------
    def list_presets(self, unit_id: str | None = None) -> list[dict]:
        conn = self._conn()
        try:
            if unit_id is None:
                rows = conn.execute(
                    "SELECT * FROM presets ORDER BY position, id"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM presets WHERE unit_id = ? OR unit_id IS NULL "
                    "ORDER BY position, id",
                    (unit_id,),
                ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def add_preset(self, reference: str, unit_id: str | None = None,
                   label: str | None = None) -> dict:
        conn = self._conn()
        try:
            pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM presets"
            ).fetchone()["p"]
            cur = conn.execute(
                "INSERT INTO presets (unit_id, reference, label, position, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (unit_id, reference, label, pos, time.time()),
            )
            conn.commit()
            preset_id = cur.lastrowid
            return dict(conn.execute(
                "SELECT * FROM presets WHERE id = ?", (preset_id,)
            ).fetchone())
        finally:
            conn.close()

    def update_preset(self, preset_id: int, reference: str | None = None,
                      label: str | None = None, position: int | None = None) -> dict:
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT * FROM presets WHERE id = ?", (preset_id,)
            ).fetchone()
            if row is None:
                raise ValueError(f"unknown preset {preset_id}")
            conn.execute(
                "UPDATE presets SET reference = ?, label = ?, position = ? WHERE id = ?",
                (
                    reference if reference is not None else row["reference"],
                    label if label is not None else row["label"],
                    position if position is not None else row["position"],
                    preset_id,
                ),
            )
            conn.commit()
            return dict(conn.execute(
                "SELECT * FROM presets WHERE id = ?", (preset_id,)
            ).fetchone())
        finally:
            conn.close()

    def delete_preset(self, preset_id: int) -> bool:
        conn = self._conn()
        try:
            cur = conn.execute("DELETE FROM presets WHERE id = ?", (preset_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

    def reorder_presets(self, ordered_ids: list[int]) -> None:
        conn = self._conn()
        try:
            for pos, pid in enumerate(ordered_ids):
                conn.execute(
                    "UPDATE presets SET position = ? WHERE id = ?", (pos, pid)
                )
            conn.commit()
        finally:
            conn.close()

    # --- Settings KV (persistence for SS-051) -------------------------
    def get_setting(self, key: str, default: Any = None) -> Any:
        conn = self._conn()
        try:
            row = conn.execute(
                "SELECT value FROM settings WHERE key = ?", (key,)
            ).fetchone()
            return json.loads(row["value"]) if row else default
        finally:
            conn.close()

    def set_setting(self, key: str, value: Any) -> None:
        conn = self._conn()
        try:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value)),
            )
            conn.commit()
        finally:
            conn.close()

    def all_settings(self) -> dict:
        conn = self._conn()
        try:
            rows = conn.execute("SELECT key, value FROM settings").fetchall()
            return {r["key"]: json.loads(r["value"]) for r in rows}
        finally:
            conn.close()


_store: ConfigStore | None = None


def get_store() -> ConfigStore:
    global _store
    if _store is None:
        _store = ConfigStore()
    return _store


def set_store(store: ConfigStore | None) -> None:
    global _store
    _store = store
