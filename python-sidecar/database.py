"""SQLite access helpers for the SermonSync Bible database."""

from __future__ import annotations

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bible.db")


def db_exists() -> bool:
    return os.path.exists(DB_PATH)


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


def normalize_book(name: str) -> str:
    """Loosely normalize a book name/abbreviation for matching."""
    return "".join(name.lower().split())
