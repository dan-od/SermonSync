"""Bible lookup / search / metadata endpoints (SS-006)."""

from __future__ import annotations

from database import get_connection, normalize_book
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/bible", tags=["bible"])


def _version_id(conn, version: str) -> int:
    row = conn.execute(
        "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
        (version,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown version '{version}'")
    return row["id"]


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
        return {
            "reference": f"{book_row['name']} {chapter}:{verse}",
            "book": book_row["name"],
            "chapter": chapter,
            "verse": verse,
            "version": version.upper(),
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
