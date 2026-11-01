"""Bible lookup / search / metadata endpoints (SS-006)."""

from __future__ import annotations

from database import get_connection, get_writable_connection, normalize_book
from engine.matching.orchestrator import get_orchestrator
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .bible_common import _find_version_row, _version_id
from .bible_import import ImportBibleRequest, _rebuild_fts, import_bible
from .bible_import import router as import_router
from .bible_lookup import lookup, search
from .bible_lookup import router as lookup_router

__all__ = [
    "ImportBibleRequest",
    "import_bible",
    "lookup",
    "search",
]

router = APIRouter(prefix="/api/bible", tags=["bible"])
router.include_router(import_router)


class RenameBibleRequest(BaseModel):
    name: str


class ActiveBibleVersionRequest(BaseModel):
    version: str


@router.get("/versions")
def list_versions() -> dict:
    """List registered Bible versions and whether their text is populated."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT v.abbreviation, v.name,
                   (SELECT COUNT(*) FROM verses WHERE version_id = v.id) AS verse_count
            FROM versions v ORDER BY v.id
            """
        ).fetchall()
        return {
            "versions": [
                {
                    "abbreviation": r["abbreviation"],
                    "name": r["name"],
                    "verse_count": r["verse_count"],
                    "available": r["verse_count"] > 0,
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.put("/active-version")
def set_active_version(payload: ActiveBibleVersionRequest) -> dict:
    """Set the version used by live scripture matching."""
    conn = get_connection()
    try:
        row = _find_version_row(conn, payload.version)
        if row is not None:
            count_row = conn.execute(
                "SELECT COUNT(*) AS verse_count FROM verses WHERE version_id = ?",
                (row["id"],),
            ).fetchone()
            verse_count = count_row["verse_count"] if count_row else 0
        else:
            verse_count = 0
    finally:
        conn.close()

    if row is None or verse_count == 0:
        raise HTTPException(
            status_code=400, detail=f"Bible version '{payload.version}' is not available"
        )

    active = get_orchestrator().set_version(row["abbreviation"])
    return {"version": active}


@router.patch("/versions/{version}")
def rename_version(version: str, payload: RenameBibleRequest) -> dict:
    """Rename a registered Bible version without changing its abbreviation."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="version name cannot be empty")

    conn = get_writable_connection()
    try:
        row = _find_version_row(conn, version)
        if row is None:
            raise HTTPException(status_code=404, detail=f"unknown version '{version}'")
        conn.execute(
            "UPDATE versions SET name = ? WHERE id = ?",
            (name, row["id"]),
        )
        conn.commit()
        return {"status": "ok", "abbreviation": row["abbreviation"], "name": name}
    finally:
        conn.close()


@router.delete("/versions/{version}")
def delete_version(version: str) -> dict:
    """Delete a downloaded/imported version and its verse text."""
    conn = get_writable_connection()
    try:
        row = _find_version_row(conn, version)
        if row is None:
            raise HTTPException(status_code=404, detail=f"unknown version '{version}'")

        conn.execute("DELETE FROM verses WHERE version_id = ?", (row["id"],))
        conn.execute("DELETE FROM versions WHERE id = ?", (row["id"],))
        _rebuild_fts(conn)
        conn.commit()
        return {"status": "ok", "abbreviation": row["abbreviation"]}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@router.get("/books")
def list_books(version: str = Query("KJV")) -> dict:
    """List all books (canonical order). `version` validated but books are shared."""
    conn = get_connection()
    try:
        _version_id(conn, version)
        rows = conn.execute(
            "SELECT name, abbreviation, testament, position FROM books ORDER BY position"
        ).fetchall()
        return {
            "version": version.upper(),
            "count": len(rows),
            "books": [dict(r) for r in rows],
        }
    finally:
        conn.close()


@router.get("/book")
def book_contents(book: str = Query(...), version: str = Query("KJV")) -> dict:
    """Return every chapter and verse for a book in canonical order."""
    conn = get_connection()
    try:
        vid = _version_id(conn, version)
        target = normalize_book(book)
        book_row = conn.execute(
            """
            SELECT id, name, abbreviation, testament, position FROM books
            WHERE REPLACE(LOWER(name), ' ', '') = ?
               OR LOWER(abbreviation) = ?
            """,
            (target, book.lower()),
        ).fetchone()
        if book_row is None:
            raise HTTPException(status_code=404, detail=f"unknown book '{book}'")

        rows = conn.execute(
            """
            SELECT ch.number AS chapter, v.verse_number AS verse, v.text
            FROM chapters ch
            JOIN verses v ON v.chapter_id = ch.id
            WHERE ch.book_id = ? AND v.version_id = ?
            ORDER BY ch.number, v.verse_number
            """,
            (book_row["id"], vid),
        ).fetchall()

        chapters: dict[int, list[dict]] = {}
        for row in rows:
            chapters.setdefault(row["chapter"], []).append(
                {"verse": row["verse"], "text": row["text"]}
            )

        return {
            "version": version.upper(),
            "book": {
                "name": book_row["name"],
                "abbreviation": book_row["abbreviation"],
                "testament": book_row["testament"],
                "position": book_row["position"],
            },
            "chapters": [
                {"number": number, "verses": verses}
                for number, verses in chapters.items()
            ],
        }
    finally:
        conn.close()


router.include_router(lookup_router)
