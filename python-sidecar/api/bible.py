"""Bible lookup / search / metadata endpoints (SS-006)."""

from __future__ import annotations

from database import get_connection, get_writable_connection, normalize_book
from engine.matching.orchestrator import get_orchestrator
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.bible_db import (
    _canonical_book_row,
    _ensure_chapter,
    _find_version_row,
    _rebuild_fts,
    _upsert_version,
    _version_id,
)
from api.bible_import_parse import _first_non_empty, _parse_bible_import

router = APIRouter(prefix="/api/bible", tags=["bible"])


class ImportBibleRequest(BaseModel):
    filename: str
    content: str


class RenameBibleRequest(BaseModel):
    name: str


class ActiveBibleVersionRequest(BaseModel):
    version: str


@router.post("/import")
def import_bible(payload: ImportBibleRequest) -> dict:
    filename = _first_non_empty(payload.filename, "import.xml") or "import.xml"
    content = payload.content

    if not content.strip():
        raise HTTPException(status_code=400, detail="missing bible file content")

    version_name, version_abbreviation, books = _parse_bible_import(filename, content)

    conn = get_writable_connection()
    try:
        version_id = _upsert_version(conn, version_name, version_abbreviation)
        conn.execute("DELETE FROM verses WHERE version_id = ?", (version_id,))

        verse_count = 0
        for book in books:
            row = _canonical_book_row(conn, book)
            book_id = row["id"]
            # Display the canonical name/abbreviation, not an unnamed schema's
            # positional fallback (e.g. "Book 1"), in the response payload below.
            book["name"] = row["name"]
            book["abbreviation"] = row["abbreviation"]
            for chapter_index, chapter in enumerate(book["chapters"], start=1):
                chapter_number = chapter.get("number") or chapter_index
                chapter_id = _ensure_chapter(conn, book_id, chapter_number)
                for verse in chapter["verses"]:
                    conn.execute(
                        (
                            "INSERT INTO verses "
                            "(chapter_id, verse_number, text, version_id) "
                            "VALUES (?, ?, ?, ?)"
                        ),
                        (chapter_id, verse["verse"], verse["text"], version_id),
                    )
                    verse_count += 1

        _rebuild_fts(conn)
        conn.commit()
        return {
            "status": "ok",
            "version": {
                "name": version_name,
                "abbreviation": version_abbreviation,
                "verse_count": verse_count,
                "available": verse_count > 0,
            },
            "books": [
                {
                    "name": book["name"],
                    "abbreviation": book["abbreviation"],
                    "testament": book["testament"],
                    "position": book["position"],
                }
                for book in books
            ],
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


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


@router.get("/lookup")
def lookup(
    book: str = Query(...),
    chapter: int = Query(..., ge=1),
    verse: int = Query(..., ge=1),
    version: str = Query("KJV"),
) -> dict:
    """Return a single verse's text + metadata."""
    conn = get_connection()
    try:
        vid = _version_id(conn, version)
        target = normalize_book(book)
        book_row = conn.execute(
            """
            SELECT id, name, testament, position FROM books
            WHERE REPLACE(LOWER(name), ' ', '') = ?
               OR LOWER(abbreviation) = ?
            """,
            (target, book.lower()),
        ).fetchone()
        if book_row is None:
            raise HTTPException(status_code=404, detail=f"unknown book '{book}'")

        row = conn.execute(
            """
            SELECT v.verse_number, v.text
            FROM verses v
            JOIN chapters ch ON v.chapter_id = ch.id
            WHERE ch.book_id = ? AND ch.number = ?
              AND v.verse_number = ? AND v.version_id = ?
            """,
            (book_row["id"], chapter, verse, vid),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=404,
                detail=f"{book_row['name']} {chapter}:{verse} not found in {version.upper()}",
            )
        vrow = conn.execute(
            "SELECT name, abbreviation FROM versions WHERE id = ?",
            (vid,),
        ).fetchone()
        version_display = (
            vrow["name"] if vrow and vrow["name"]
            else (vrow["abbreviation"] if vrow else version.upper())
        )
        return {
            "reference": f"{book_row['name']} {chapter}:{verse}",
            "book": book_row["name"],
            "chapter": chapter,
            "verse": verse,
            "version": version_display,
            "text": row["text"],
            "testament": book_row["testament"],
        }
    finally:
        conn.close()


@router.get("/search")
def search(
    q: str = Query(..., min_length=2),
    version: str = Query("KJV"),
    limit: int = Query(10, ge=1, le=50),
) -> dict:
    """FTS5 ranked full-text search over verse text."""
    conn = get_connection()
    try:
        vid = _version_id(conn, version)
        # Build a safe FTS query: quote each token so punctuation can't break syntax.
        tokens = [t for t in q.replace('"', " ").split() if t]
        if not tokens:
            raise HTTPException(status_code=400, detail="empty query")
        match_expr = " ".join(f'"{t}"' for t in tokens)
        try:
            rows = conn.execute(
                """
                SELECT b.name AS book, ch.number AS chapter, v.verse_number AS verse,
                       v.text, bm25(verses_fts) AS score
                FROM verses_fts
                JOIN verses v ON v.id = verses_fts.rowid
                JOIN chapters ch ON v.chapter_id = ch.id
                JOIN books b ON ch.book_id = b.id
                WHERE verses_fts MATCH ? AND v.version_id = ?
                ORDER BY score
                LIMIT ?
                """,
                (match_expr, vid, limit),
            ).fetchall()
        except Exception as exc:  # malformed FTS expression, etc.
            raise HTTPException(
                status_code=400, detail=f"search failed: {exc}"
            ) from exc

        return {
            "query": q,
            "version": version.upper(),
            "count": len(rows),
            "results": [
                {
                    "reference": f"{r['book']} {r['chapter']}:{r['verse']}",
                    "book": r["book"],
                    "chapter": r["chapter"],
                    "verse": r["verse"],
                    "text": r["text"],
                    # bm25 returns lower = better; expose a positive relevance.
                    "relevance": round(-r["score"], 4),
                }
                for r in rows
            ],
        }
    finally:
        conn.close()
