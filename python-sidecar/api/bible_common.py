"""Version and identifier helpers shared by the Bible endpoints (SS-006)."""

from __future__ import annotations

import re

from fastapi import HTTPException

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
    # Longer abbreviation conventions (4-6 letters) seen in Zefania/OSIS/USFM
    # exports whose canonical DB abbreviation is the shorter 3-letter KJV form.
    "exod": "Exodus",
    "levi": "Leviticus",
    "numb": "Numbers",
    "deut": "Deuteronomy",
    "josh": "Joshua",
    "judg": "Judges",
    "1sam": "1 Samuel",
    "2sam": "2 Samuel",
    "1kgs": "1 Kings",
    "2kgs": "2 Kings",
    "1chr": "1 Chronicles",
    "1chron": "1 Chronicles",
    "2chr": "2 Chronicles",
    "2chron": "2 Chronicles",
    "esth": "Esther",
    "prov": "Proverbs",
    "eccl": "Ecclesiastes",
    "eccle": "Ecclesiastes",
    "ezek": "Ezekiel",
    "obad": "Obadiah",
    "zeph": "Zephaniah",
    "zech": "Zechariah",
    "matt": "Matthew",
    "1cor": "1 Corinthians",
    "2cor": "2 Corinthians",
    "phil": "Philippians",
    "1thess": "1 Thessalonians",
    "2thess": "2 Thessalonians",
    "1tim": "1 Timothy",
    "2tim": "2 Timothy",
    "philem": "Philemon",
    "1pet": "1 Peter",
    "2pet": "2 Peter",
    "1jn": "1 John",
    "2jn": "2 John",
    "3jn": "3 John",
}


_VERSION_ALIASES: dict[str, str] = {
    "englishnkjv": "ENGLISHNKJ",
}


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


def _normalize_identifier(value: str | None, fallback: str) -> str:
    token = re.sub(r"[^A-Za-z0-9]+", "", value or "")
    return token.upper() or fallback.upper()
