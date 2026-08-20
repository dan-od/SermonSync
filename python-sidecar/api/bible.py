"""Bible lookup / search / metadata endpoints (SS-006)."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from database import get_connection, get_writable_connection, normalize_book
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/api/bible", tags=["bible"])

# Maps normalize_book(alias) → canonical book name.
# Handles non-standard labels that appear in real-world Zefania / OSIS files.
_BOOK_ALIASES: dict[str, str] = {
    # Song of Solomon variants
    "songofsongs": "Song of Solomon",
    "canticleofcanticles": "Song of Solomon",
    "canticles": "Song of Solomon",
    "song": "Song of Solomon",
    "cant": "Song of Solomon",
    # Psalms — many XML files omit the trailing ‘s’
    "psalm": "Psalms",
    # Revelation variants
    "revelationofjohn": "Revelation",
    "therevelation": "Revelation",
    "apocalypse": "Revelation",
    "apocalypseofjohn": "Revelation",
}

_VERSION_ALIASES: dict[str, str] = {
    "englishnkjv": "ENGLISHNKJ",
}


class ImportBibleRequest(BaseModel):
    filename: str
    content: str


class RenameBibleRequest(BaseModel):
    name: str


def _version_lookup_key(version: str) -> str:
    normalized = _normalize_identifier(version, version)
    return _VERSION_ALIASES.get(normalized.lower(), normalized)


def _version_id(conn, version: str) -> int:
    version = _version_lookup_key(version)
    row = conn.execute(
        "SELECT id FROM versions WHERE abbreviation = ? COLLATE NOCASE",
        (version,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"unknown version '{version}'")
    return row["id"]


def _normalize_identifier(value: str | None, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9]+", "", value or "")
    return token.upper() or fallback.upper()


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        match = re.search(r"\d+", value)
        if match:
            return int(match.group(0))
    return None


def _first_non_empty(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _clean_label(value: str | None, fallback: str) -> str:
    label = _first_non_empty(value, fallback) or fallback
    return label.split(".")[0].strip() or fallback


def _parse_version_metadata(filename: str, raw_version: Any) -> tuple[str, str]:
    fallback = Path(filename).stem or "BIBLE"

    if isinstance(raw_version, dict):
        name = _first_non_empty(
            raw_version.get("name"),
            raw_version.get("title"),
            raw_version.get("version"),
            raw_version.get("label"),
        )
        abbreviation = _first_non_empty(
            raw_version.get("abbreviation"),
            raw_version.get("abbr"),
            raw_version.get("code"),
            raw_version.get("id"),
        )
        return (
            name or fallback,
            _normalize_identifier(abbreviation or name, fallback),
        )

    if isinstance(raw_version, str):
        return raw_version.strip() or fallback, _normalize_identifier(raw_version, fallback)

    return fallback, _normalize_identifier(fallback, fallback)


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


def _canonical_book_id(conn, book: dict[str, Any]) -> int:
    row = _resolve_book_row(conn, book["name"], book.get("abbreviation"))
    if row is None:
        raise HTTPException(status_code=400, detail=f"unknown canonical book '{book['name']}'")
    return row["id"]


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


def _element_text(element: ET.Element) -> str:
    return " ".join(part.strip() for part in element.itertext() if part.strip())


def _is_book_element(element: ET.Element) -> bool:
    name = _local_name(element.tag)
    return name in {"biblebook", "book", "b"} or (
        name == "div" and element.attrib.get("type", "").lower() == "book"
    )


def _is_chapter_element(element: ET.Element) -> bool:
    return _local_name(element.tag) in {"chapter", "c"}


def _is_verse_element(element: ET.Element) -> bool:
    return _local_name(element.tag) in {"vers", "verse", "v"}


def _osis_last_number(value: str | None) -> int | None:
    if not value:
        return None
    matches = re.findall(r"\d+", value)
    return int(matches[-1]) if matches else None


def _xml_number(element: ET.Element, *attribute_names: str) -> int | None:
    for attribute in attribute_names:
        if attribute == "osisID":
            number = _osis_last_number(element.attrib.get(attribute))
        else:
            number = _coerce_int(element.attrib.get(attribute))
        if number is not None:
            return number
    return None


def _xml_label(element: ET.Element, fallback: str) -> str:
    label = _first_non_empty(
        element.attrib.get("name"),
        element.attrib.get("title"),
        element.attrib.get("bname"),
        element.attrib.get("abbr"),
        element.attrib.get("bsname"),
        element.attrib.get("abbreviation"),
        element.attrib.get("n"),
        element.attrib.get("osisID"),
    )
    return _clean_label(label, fallback)


def _parse_xml_verse(element: ET.Element, fallback_number: int) -> dict[str, Any]:
    number = (
        _xml_number(element, "vnumber", "verse", "number", "v", "n", "osisID")
        or fallback_number
    )
    text = _element_text(element)
    if not text:
        raise HTTPException(status_code=400, detail="verse text is missing")
    return {"verse": number, "text": text}


def _parse_xml_chapter(element: ET.Element, fallback_number: int) -> dict[str, Any]:
    number = (
        _xml_number(element, "cnumber", "chapter", "number", "c", "n", "osisID")
        or fallback_number
    )
    verse_elements = [child for child in list(element) if _is_verse_element(child)]
    parsed_verses = [
        _parse_xml_verse(verse, verse_index)
        for verse_index, verse in enumerate(verse_elements, start=1)
    ]

    if not parsed_verses and _is_verse_element(element):
        parsed_verses = [_parse_xml_verse(element, 1)]

    if not parsed_verses:
        raise HTTPException(status_code=400, detail=f"chapter {number} has no verses")

    return {"number": number, "verses": parsed_verses}


def _parse_xml_book(element: ET.Element, fallback_position: int) -> dict[str, Any]:
    name = _xml_label(element, f"Book {fallback_position}")
    abbreviation = _normalize_identifier(
        _first_non_empty(
            element.attrib.get("abbreviation"),
            element.attrib.get("abbr"),
            element.attrib.get("bsname"),
            element.attrib.get("bnumber"),
            element.attrib.get("code"),
            name,
        ),
        name,
    )
    testament = _first_non_empty(element.attrib.get("testament"), "NT") or "NT"
    position = _xml_number(element, "position", "index", "order") or fallback_position

    chapter_elements = [child for child in list(element) if _is_chapter_element(child)]
    if not chapter_elements:
        chapter_elements = [element]

    parsed_chapters = [
        _parse_xml_chapter(chapter, chapter_index)
        for chapter_index, chapter in enumerate(chapter_elements, start=1)
    ]
    if not parsed_chapters:
        raise HTTPException(status_code=400, detail=f"book '{name}' has no chapters")

    return {
        "name": name,
        "abbreviation": abbreviation,
        "testament": testament.upper(),
        "position": position,
        "chapters": parsed_chapters,
    }


def _parse_xml_import(filename: str, content: str) -> tuple[str, str, list[dict[str, Any]]]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"invalid XML bible file: {exc}") from exc

    version_name, version_abbreviation = _parse_version_metadata(
        filename,
        {
            "name": _first_non_empty(
                root.attrib.get("biblename"),
                root.attrib.get("name"),
                root.attrib.get("title"),
                root.attrib.get("version"),
            ),
            "abbreviation": _first_non_empty(
                root.attrib.get("biblename"),
                root.attrib.get("abbreviation"),
                root.attrib.get("abbr"),
                root.attrib.get("code"),
            ),
        },
    )

    book_elements = [element for element in root.iter() if _is_book_element(element)]
    if not book_elements and _is_book_element(root):
        book_elements = [root]
    if not book_elements:
        raise HTTPException(status_code=400, detail="XML bible file is missing book elements")

    parsed_books = [
        _parse_xml_book(book, book_index)
        for book_index, book in enumerate(book_elements, start=1)
    ]
    return version_name, version_abbreviation, parsed_books


def _parse_bible_import(filename: str, content: str) -> tuple[str, str, list[dict[str, Any]]]:
    suffix = Path(filename).suffix.lower()

    if suffix == ".xml":
        return _parse_xml_import(filename, content)

    raise HTTPException(status_code=400, detail="unsupported bible file format; expected .xml")


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
            book_id = _canonical_book_id(conn, book)
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


@router.patch("/versions/{version}")
def rename_version(version: str, payload: RenameBibleRequest) -> dict:
    """Rename a registered Bible version without changing its abbreviation."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="version name cannot be empty")

    conn = get_writable_connection()
    try:
        lookup_key = _version_lookup_key(version)
        row = conn.execute(
            "SELECT id, abbreviation FROM versions WHERE abbreviation = ? COLLATE NOCASE",
            (lookup_key,),
        ).fetchone()
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
        lookup_key = _version_lookup_key(version)
        row = conn.execute(
            "SELECT id, abbreviation FROM versions WHERE abbreviation = ? COLLATE NOCASE",
            (lookup_key,),
        ).fetchone()
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
