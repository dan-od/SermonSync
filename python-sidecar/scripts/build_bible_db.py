"""Build the SermonSync SQLite Bible database.

Populates the full public-domain KJV text and creates placeholder version
entries for the copyrighted translations (NIV/NKJV/AMP) whose text is TBD
pending licensing.

Usage:
    python scripts/build_bible_db.py [--source PATH_OR_URL] [--out data/bible.db]

The KJV source is the public-domain JSON from thiagobodruk/bible (books in
canonical order, each a list of chapters, each a list of verse strings).
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import urllib.request

KJV_URL = "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json"

# Canonical 66-book order. The KJV JSON is already in this order, so we zip by
# index. testament is derived from position (<=39 -> Old Testament).
BOOKS = [
    ("Genesis", "Gen"), ("Exodus", "Exo"), ("Leviticus", "Lev"),
    ("Numbers", "Num"), ("Deuteronomy", "Deu"), ("Joshua", "Jos"),
    ("Judges", "Jdg"), ("Ruth", "Rut"), ("1 Samuel", "1Sa"),
    ("2 Samuel", "2Sa"), ("1 Kings", "1Ki"), ("2 Kings", "2Ki"),
    ("1 Chronicles", "1Ch"), ("2 Chronicles", "2Ch"), ("Ezra", "Ezr"),
    ("Nehemiah", "Neh"), ("Esther", "Est"), ("Job", "Job"),
    ("Psalms", "Psa"), ("Proverbs", "Pro"), ("Ecclesiastes", "Ecc"),
    ("Song of Solomon", "Sng"), ("Isaiah", "Isa"), ("Jeremiah", "Jer"),
    ("Lamentations", "Lam"), ("Ezekiel", "Eze"), ("Daniel", "Dan"),
    ("Hosea", "Hos"), ("Joel", "Joe"), ("Amos", "Amo"),
    ("Obadiah", "Oba"), ("Jonah", "Jon"), ("Micah", "Mic"),
    ("Nahum", "Nah"), ("Habakkuk", "Hab"), ("Zephaniah", "Zep"),
    ("Haggai", "Hag"), ("Zechariah", "Zec"), ("Malachi", "Mal"),
    ("Matthew", "Mat"), ("Mark", "Mrk"), ("Luke", "Luk"),
    ("John", "Jhn"), ("Acts", "Act"), ("Romans", "Rom"),
    ("1 Corinthians", "1Co"), ("2 Corinthians", "2Co"), ("Galatians", "Gal"),
    ("Ephesians", "Eph"), ("Philippians", "Php"), ("Colossians", "Col"),
    ("1 Thessalonians", "1Th"), ("2 Thessalonians", "2Th"), ("1 Timothy", "1Ti"),
    ("2 Timothy", "2Ti"), ("Titus", "Tit"), ("Philemon", "Phm"),
    ("Hebrews", "Heb"), ("James", "Jas"), ("1 Peter", "1Pe"),
    ("2 Peter", "2Pe"), ("1 John", "1Jn"), ("2 John", "2Jn"),
    ("3 John", "3Jn"), ("Jude", "Jud"), ("Revelation", "Rev"),
]

# Version entries. KJV is public domain and fully populated. The rest are
# copyrighted — we register the version row but leave the text unpopulated.
# TODO(licensing): populate NIV/NKJV/AMP verse text once licensing is secured.
VERSIONS = [
    ("King James Version", "KJV", True),
    ("New International Version", "NIV", False),   # TODO: copyrighted, licensing TBD
    ("New King James Version", "NKJV", False),     # TODO: copyrighted, licensing TBD
    ("Amplified Bible", "AMP", False),             # TODO: copyrighted, licensing TBD
]

SCHEMA = """
-- Keep the distributable DB a single file (no -wal/-shm sidecars); it is
-- opened read-only at runtime.
PRAGMA journal_mode = DELETE;

CREATE TABLE IF NOT EXISTS versions (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    abbreviation TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS books (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    abbreviation TEXT,
    testament    TEXT NOT NULL,          -- 'OT' | 'NT'
    position     INTEGER NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS chapters (
    id       INTEGER PRIMARY KEY,
    book_id  INTEGER NOT NULL REFERENCES books(id),
    number   INTEGER NOT NULL,
    UNIQUE (book_id, number)
);

CREATE TABLE IF NOT EXISTS verses (
    id           INTEGER PRIMARY KEY,
    chapter_id   INTEGER NOT NULL REFERENCES chapters(id),
    verse_number INTEGER NOT NULL,
    text         TEXT NOT NULL,
    version_id   INTEGER NOT NULL REFERENCES versions(id)
);

-- Fast book+chapter+verse lookup.
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, number);
CREATE INDEX IF NOT EXISTS idx_verses_lookup
    ON verses(chapter_id, verse_number, version_id);
CREATE INDEX IF NOT EXISTS idx_verses_version ON verses(version_id);

-- Full-text search over verse text (external-content FTS5 mirroring `verses`).
CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
    text,
    content='verses',
    content_rowid='id',
    tokenize='porter unicode61'
);
"""


def load_kjv(source: str) -> list:
    if source.startswith("http://") or source.startswith("https://"):
        print(f"Downloading KJV from {source} ...")
        with urllib.request.urlopen(source) as resp:
            raw = resp.read()
    else:
        print(f"Reading KJV from {source} ...")
        with open(source, "rb") as fh:
            raw = fh.read()
    # File may carry a UTF-8 BOM.
    return json.loads(raw.decode("utf-8-sig"))


def build(source: str, out: str) -> None:
    kjv = load_kjv(source)
    if len(kjv) != 66:
        raise SystemExit(f"expected 66 books, got {len(kjv)}")

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if os.path.exists(out):
        os.remove(out)

    conn = sqlite3.connect(out)
    try:
        conn.executescript(SCHEMA)

        # Versions
        version_ids = {}
        for name, abbr, _populated in VERSIONS:
            cur = conn.execute(
                "INSERT INTO versions (name, abbreviation) VALUES (?, ?)",
                (name, abbr),
            )
            version_ids[abbr] = cur.lastrowid
        kjv_id = version_ids["KJV"]

        # Books + chapters + verses (KJV only)
        verse_rows = 0
        for pos, (book, book_data) in enumerate(zip(BOOKS, kjv), start=1):
            name, abbr = book
            testament = "OT" if pos <= 39 else "NT"
            book_cur = conn.execute(
                "INSERT INTO books (name, abbreviation, testament, position) "
                "VALUES (?, ?, ?, ?)",
                (name, abbr, testament, pos),
            )
            book_id = book_cur.lastrowid
            chapters = book_data["chapters"] if isinstance(book_data, dict) else book_data
            for c_num, verses in enumerate(chapters, start=1):
                chap_cur = conn.execute(
                    "INSERT INTO chapters (book_id, number) VALUES (?, ?)",
                    (book_id, c_num),
                )
                chapter_id = chap_cur.lastrowid
                for v_num, text in enumerate(verses, start=1):
                    conn.execute(
                        "INSERT INTO verses (chapter_id, verse_number, text, version_id) "
                        "VALUES (?, ?, ?, ?)",
                        (chapter_id, v_num, text.strip(), kjv_id),
                    )
                    verse_rows += 1

        # Populate FTS from the content table.
        conn.execute(
            "INSERT INTO verses_fts (rowid, text) SELECT id, text FROM verses"
        )
        conn.commit()
        print(f"KJV populated: {verse_rows} verses across {len(BOOKS)} books.")
        print("Placeholder versions (no text yet): NIV, NKJV, AMP  # TODO: licensing")
        print(f"Wrote {out} ({os.path.getsize(out) / 1_048_576:.1f} MB)")
    finally:
        conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the SermonSync Bible DB")
    ap.add_argument("--source", default=KJV_URL, help="KJV JSON path or URL")
    ap.add_argument("--out", default="data/bible.db", help="output SQLite path")
    args = ap.parse_args()
    build(args.source, args.out)


if __name__ == "__main__":
    main()
