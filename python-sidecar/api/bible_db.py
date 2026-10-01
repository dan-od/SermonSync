"""Database query helpers shared by the Bible endpoints (SS-006)."""

from __future__ import annotations

from typing import Any

from database import normalize_book
from fastapi import HTTPException

from api.bible_aliases import _BOOK_ALIASES, _VERSION_ALIASES
from api.bible_import_parse import _normalize_identifier


def _version_lookup_key(version: str) -> str:
    normalized = _normalize_identifier(version, version)
    return _VERSION_ALIASES.get(normalized.lower(), normalized)


def _find_version_row(conn, version: str):
    lookup_key = _version_lookup_key(version)
    return conn.execute(
        """
        SELECT id, abbreviation, name FROM versions
        WHERE abbreviation = ? COLLATE NOCASE
           OR name = ? COLLATE NOCASE
           OR abbreviation = ? COLLATE NOCASE
        """,
        (version, version, lookup_key),
    ).fetchone()


def _version_id(conn, version: str) -> int:
    row = _find_version_row(conn, version)
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown version '{version}'")
    return row["id"]


def _resolve_book_row(conn, name: str | None, abbreviation: str | None):
    for candidate in (name, abbreviation):
        if not candidate:
            continue
        target = normalize_book(candidate)
        # Apply alias mapping for non-standard XML book labels before DB lookup.
        canonical = _BOOK_ALIASES.get(target)
        if canonical is not None:
            target = normalize_book(canonical)
            lookup_abbr = canonical.lower()
        else:
            lookup_abbr = candidate.lower()
        row = conn.execute(
            """
            SELECT id, name, abbreviation, testament, position FROM books
            WHERE REPLACE(LOWER(name), ' ', '') = ?
               OR LOWER(abbreviation) = ?
            """,
            (target, lookup_abbr),
        ).fetchone()
        if row is not None:
            return row
    return None


def _canonical_book_row(conn, book: dict[str, Any]):
    row = _resolve_book_row(conn, book["name"], book.get("abbreviation"))
    if row is None and book.get("canonical_position_hint"):
        # Unnamed books (e.g. <testament name="Old"><book number="1">) were
        # resolved to a canonical 1..66 position instead of a name/abbreviation.
        row = conn.execute(
            "SELECT id, name, abbreviation, testament, position FROM books WHERE position = ?",
            (book["canonical_position_hint"],),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=400, detail=f"unknown canonical book '{book['name']}'")
    return row


def _ensure_chapter(conn, book_id: int, number: int) -> int:
    row = conn.execute(
        "SELECT id FROM chapters WHERE book_id = ? AND number = ?",
        (book_id, number),
    ).fetchone()
    if row is not None:
        return row["id"]

    # Chapter not yet in the schema (e.g. partial build_bible_db.py run).
    # Insert it so imports succeed without requiring a full DB rebuild.
    cur = conn.execute(
        "INSERT INTO chapters (book_id, number) VALUES (?, ?)",
        (book_id, number),
    )
    return cur.lastrowid


def _upsert_version(conn, name: str, abbreviation: str) -> int:
    row = conn.execute(
        "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
        (abbreviation,),
    ).fetchone()
    if row is None:
        cur = conn.execute(
            "INSERT INTO versions (name, abbreviation) VALUES (?, ?)",
            (name, abbreviation),
        )
        return cur.lastrowid

    conn.execute(
        "UPDATE versions SET name = ?, abbreviation = ? WHERE id = ?",
        (name, abbreviation, row["id"]),
    )
    return row["id"]


def _rebuild_fts(conn) -> None:
    conn.execute("INSERT INTO verses_fts(verses_fts) VALUES ('rebuild')")
