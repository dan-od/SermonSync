"""Pure parsing helpers for Bible file imports (XML: Zefania / OSIS / testament-numbered)."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from fastapi import HTTPException


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

def _element_text(element: ET.Element) -> str:
    return " ".join(part.strip() for part in element.itertext() if part.strip())


def _is_book_element(element: ET.Element) -> bool:
    name = _local_name(element.tag)
    return name in {"biblebook", "book", "b"} or (
        name == "div" and element.attrib.get("type", "").lower() == "book"
    )


def _is_testament_element(element: ET.Element) -> bool:
    return _local_name(element.tag) == "testament"


def _testament_offset(element: ET.Element) -> int | None:
    """Canonical position offset for a <testament> wrapper (some XML schemas number
    books 1..39 / 1..27 within Old/New Testament instead of giving them names)."""
    label = (
        _first_non_empty(
            element.attrib.get("name"), element.attrib.get("type"), element.attrib.get("testament")
        )
        or ""
    ).strip().lower()
    if label.startswith("old") or label in {"ot", "o"}:
        return 0
    if label.startswith("new") or label in {"nt", "n"}:
        return 39
    return None


def _canonical_testament_position(offset: int | None, number: int | None) -> int | None:
    if offset is None or number is None:
        return None
    if offset == 39 and number >= 40:
        return number
    return offset + number


def _book_elements_under(element: ET.Element) -> list[ET.Element]:
    return [
        candidate for candidate in element.iter()
        if candidate is not element and _is_book_element(candidate)
    ]


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


def _parse_xml_book(
    element: ET.Element, fallback_position: int, position_hint: int | None = None
) -> dict[str, Any]:
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
    # Zefania XML's `bnumber` is the book's canonical 1..66 position (not a
    # testament-local number) — the most reliable signal when a file omits a
    # recognizable name/abbreviation, so prefer it over the generic fallbacks.
    explicit_position = (
        position_hint
        or _xml_number(element, "bnumber")
        or _xml_number(element, "position", "index", "order", "number")
    )
    position = explicit_position or fallback_position

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
        "canonical_position_hint": explicit_position,
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

    # Schemas like <bible><testament name="Old"><book number="1">... number books
    # 1..39 / 1..27 within their testament instead of naming them — resolve the
    # canonical 1..66 position from the testament label so lookup can fall back
    # to it when no book name/abbreviation is present.
    testament_elements = [element for element in root.iter() if _is_testament_element(element)]
    book_entries: list[tuple[ET.Element, int | None]] = []
    if testament_elements:
        for testament in testament_elements:
            offset = _testament_offset(testament)
            for book in _book_elements_under(testament):
                number = _xml_number(book, "number", "position", "index", "order")
                hint = _canonical_testament_position(offset, number)
                book_entries.append((book, hint))
    else:
        book_elements = [element for element in root.iter() if _is_book_element(element)]
        if not book_elements and _is_book_element(root):
            book_elements = [root]
        book_entries = [(book, None) for book in book_elements]

    if not book_entries:
        raise HTTPException(status_code=400, detail="XML bible file is missing book elements")

    parsed_books = [
        _parse_xml_book(book, book_index, position_hint)
        for book_index, (book, position_hint) in enumerate(book_entries, start=1)
    ]
    return version_name, version_abbreviation, parsed_books


def _parse_bible_import(filename: str, content: str) -> tuple[str, str, list[dict[str, Any]]]:
    suffix = Path(filename).suffix.lower()

    if suffix == ".xml":
        return _parse_xml_import(filename, content)

    raise HTTPException(status_code=400, detail="unsupported bible file format; expected .xml")
