"""SQLite access helpers for the SermonSync Bible database."""

from __future__ import annotations

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bible.db")

# Mutable application state (sessions, archive, presets, config) lives in a
# SEPARATE writable DB so the bundled read-only bible.db is never polluted.
APP_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "app.db")


def db_exists() -> bool:
    return os.path.exists(DB_PATH)


def get_app_connection(path: str | None = None) -> sqlite3.Connection:
    """Open (creating if needed) the writable app-state DB.

    Used for sessions/archive/presets/config — anything the operator mutates at
    runtime. Distinct from the read-only Bible DB.
    """
    db_path = path or APP_DB_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_connection() -> sqlite3.Connection:
    """Open a read-only connection with dict-like rows.

    Raises FileNotFoundError if the DB has not been built yet
    (run scripts/build_bible_db.py).
    """
    if not db_exists():
        raise FileNotFoundError(
            f"Bible DB not found at {DB_PATH}. "
            "Run: python scripts/build_bible_db.py"
        )
    uri = f"file:{DB_PATH}?mode=ro"
    conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_writable_connection() -> sqlite3.Connection:
    """Open a writable SQLite connection with dict-like rows."""
    if not db_exists():
        raise FileNotFoundError(
            f"Bible DB not found at {DB_PATH}. "
            "Run: python scripts/build_bible_db.py"
        )

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def normalize_book(name: str) -> str:
    """Loosely normalize a book name/abbreviation for matching."""
    return "".join(name.lower().split())
