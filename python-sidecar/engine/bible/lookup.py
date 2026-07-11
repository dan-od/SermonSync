"""Verse lookup helpers used by the matchers to hydrate references (SS-019/020)."""

from __future__ import annotations

from database import get_connection, normalize_book


def fetch_verse(book: str, chapter: int, verse: int, version: str = "KJV") -> dict | None:
    """Return a verse dict for a book/chapter/verse, or None if not found."""
    conn = get_connection()
    try:
        vid = conn.execute(
            "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
            (version,),
        ).fetchone()
        if vid is None:
            return None
        target = normalize_book(book)
        book_row = conn.execute(
            """
            SELECT id, name FROM books
            WHERE REPLACE(LOWER(name), ' ', '') = ? OR LOWER(abbreviation) = ?
            """,
            (target, book.lower()),
        ).fetchone()
        if book_row is None:
            return None
        row = conn.execute(
            """
            SELECT v.text FROM verses v
            JOIN chapters ch ON v.chapter_id = ch.id
            WHERE ch.book_id = ? AND ch.number = ? AND v.verse_number = ?
              AND v.version_id = ?
            """,
            (book_row["id"], chapter, verse, vid["id"]),
        ).fetchone()
        if row is None:
            return None
        return {
            "book": book_row["name"],
            "chapter": chapter,
            "verse": verse,
            "version": version.upper(),
            "reference": f"{book_row['name']} {chapter}:{verse}",
            "text": row["text"],
        }
    finally:
        conn.close()
