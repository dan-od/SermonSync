from __future__ import annotations

import sqlite3

import database
import pytest
from api.bible import ImportBibleRequest, import_bible, list_versions, lookup
from fastapi import HTTPException

SCHEMA = """
CREATE TABLE versions (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL UNIQUE
);
CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT,
    testament TEXT NOT NULL,
    position INTEGER NOT NULL UNIQUE
);
CREATE TABLE chapters (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id),
    number INTEGER NOT NULL,
    UNIQUE (book_id, number)
);
CREATE TABLE verses (
    id INTEGER PRIMARY KEY,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id),
    verse_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    version_id INTEGER NOT NULL REFERENCES versions(id)
);
CREATE VIRTUAL TABLE verses_fts USING fts5(
    text,
    content='verses',
    content_rowid='id',
    tokenize='porter unicode61'
);
"""


@pytest.fixture()
def bible_db(tmp_path, monkeypatch):
    db_path = tmp_path / "bible.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    conn.execute(
        "INSERT INTO versions (name, abbreviation) VALUES (?, ?)",
        ("King James Version", "KJV"),
    )

    john_id = conn.execute(
        "INSERT INTO books (name, abbreviation, testament, position) VALUES (?, ?, ?, ?)",
        ("John", "JHN", "NT", 43),
    ).lastrowid
    genesis_id = conn.execute(
        "INSERT INTO books (name, abbreviation, testament, position) VALUES (?, ?, ?, ?)",
        ("Genesis", "GEN", "OT", 1),
    ).lastrowid
    conn.execute("INSERT INTO chapters (book_id, number) VALUES (?, ?)", (john_id, 3))
    conn.execute("INSERT INTO chapters (book_id, number) VALUES (?, ?)", (genesis_id, 1))
    conn.commit()
    conn.close()

    monkeypatch.setattr(database, "DB_PATH", str(db_path))
    return db_path


def test_import_zefania_xml_and_refresh_versions(bible_db):
    result = import_bible(
        ImportBibleRequest(
            filename="test-version.xml",
            content="""
                <XMLBIBLE biblename="Test Version">
                  <BIBLEBOOK bnumber="43" bname="John" bsname="JHN">
                    <CHAPTER cnumber="3">
                      <VERS vnumber="16">Imported John text.</VERS>
                    </CHAPTER>
                  </BIBLEBOOK>
                </XMLBIBLE>
            """,
        )
    )

    assert result["version"]["abbreviation"] == "TESTVERSION"
    assert result["version"]["verse_count"] == 1
    assert any(version["abbreviation"] == "TESTVERSION" for version in list_versions()["versions"])
    assert lookup("John", 3, 16, "TESTVERSION")["text"] == "Imported John text."


def test_import_osis_xml(bible_db):
    result = import_bible(
        ImportBibleRequest(
            filename="osis.xml",
            content="""
                <osis code="OSIS">
                  <osisText>
                    <div type="book" osisID="John">
                      <chapter osisID="John.3">
                        <verse osisID="John.3.16">OSIS John text.</verse>
                      </chapter>
                    </div>
                  </osisText>
                </osis>
            """,
        )
    )

    assert result["version"]["abbreviation"] == "OSIS"
    assert lookup("John", 3, 16, "OSIS")["text"] == "OSIS John text."


def test_duplicate_version_overwrites_existing_text(bible_db):
    payload = ImportBibleRequest(
        filename="dup.xml",
        content="""
            <XMLBIBLE biblename="DUP">
              <BIBLEBOOK bname="John" bsname="JHN">
                <CHAPTER cnumber="3">
                  <VERS vnumber="16">Old text.</VERS>
                </CHAPTER>
              </BIBLEBOOK>
            </XMLBIBLE>
        """,
    )
    import_bible(payload)
    payload = ImportBibleRequest(
      filename=payload.filename,
      content=payload.content.replace("Old text.", "New text."),
    )

    result = import_bible(payload)

    assert result["version"]["verse_count"] == 1
    assert lookup("John", 3, 16, "DUP")["text"] == "New text."


def test_bad_import_rolls_back_existing_version(bible_db):
    import_bible(
        ImportBibleRequest(
            filename="rollback.xml",
            content="""
                <XMLBIBLE biblename="ROLLBACK">
                  <BIBLEBOOK bname="John" bsname="JHN">
                    <CHAPTER cnumber="3">
                      <VERS vnumber="16">Original text.</VERS>
                    </CHAPTER>
                  </BIBLEBOOK>
                </XMLBIBLE>
            """,
        )
    )

    with pytest.raises(HTTPException):
        import_bible(
            ImportBibleRequest(
                filename="rollback.xml",
                content="""
                    <XMLBIBLE biblename="ROLLBACK">
                      <BIBLEBOOK bname="Imaginary" bsname="IMG">
                        <CHAPTER cnumber="1">
                          <VERS vnumber="1">Should not persist.</VERS>
                        </CHAPTER>
                      </BIBLEBOOK>
                    </XMLBIBLE>
                """,
            )
        )

    assert lookup("John", 3, 16, "ROLLBACK")["text"] == "Original text."


def test_malformed_xml_raises_400(bible_db):
    with pytest.raises(HTTPException) as exc_info:
        import_bible(ImportBibleRequest(filename="bad.xml", content="<UNCLOSED>"))
    assert exc_info.value.status_code == 400
    assert "invalid XML" in exc_info.value.detail


def test_empty_verse_text_raises_400(bible_db):
    with pytest.raises(HTTPException) as exc_info:
        import_bible(
            ImportBibleRequest(
                filename="bad.xml",
                content="""
                    <XMLBIBLE biblename="Empty">
                      <BIBLEBOOK bname="John" bsname="JHN">
                        <CHAPTER cnumber="3">
                          <VERS vnumber="16"></VERS>
                        </CHAPTER>
                      </BIBLEBOOK>
                    </XMLBIBLE>
                """,
            )
        )
    assert exc_info.value.status_code == 400
    assert "verse text is missing" in exc_info.value.detail


def test_unknown_book_raises_400(bible_db):
    with pytest.raises(HTTPException) as exc_info:
        import_bible(
            ImportBibleRequest(
                filename="bad.xml",
                content="""
                    <XMLBIBLE biblename="Unknown">
                      <BIBLEBOOK bname="NotABook" bsname="NAB">
                        <CHAPTER cnumber="1">
                          <VERS vnumber="1">Text.</VERS>
                        </CHAPTER>
                      </BIBLEBOOK>
                    </XMLBIBLE>
                """,
            )
        )
    assert exc_info.value.status_code == 400
    assert "unknown canonical book" in exc_info.value.detail


def test_book_alias_song_of_songs(bible_db):
    conn = sqlite3.connect(str(bible_db))
    song_id = conn.execute(
        "INSERT INTO books (name, abbreviation, testament, position) VALUES (?, ?, ?, ?)",
        ("Song of Solomon", "Sng", "OT", 22),
    ).lastrowid
    conn.execute("INSERT INTO chapters (book_id, number) VALUES (?, ?)", (song_id, 1))
    conn.commit()
    conn.close()

    result = import_bible(
        ImportBibleRequest(
            filename="songs.xml",
            content="""
                <XMLBIBLE biblename="SongsAlias">
                  <BIBLEBOOK bname="Song of Songs">
                    <CHAPTER cnumber="1">
                      <VERS vnumber="1">A song of songs.</VERS>
                    </CHAPTER>
                  </BIBLEBOOK>
                </XMLBIBLE>
            """,
        )
    )
    assert result["version"]["verse_count"] == 1


def test_book_alias_psalm_singular(bible_db):
    conn = sqlite3.connect(str(bible_db))
    psalms_id = conn.execute(
        "INSERT INTO books (name, abbreviation, testament, position) VALUES (?, ?, ?, ?)",
        ("Psalms", "Psa", "OT", 19),
    ).lastrowid
    conn.execute("INSERT INTO chapters (book_id, number) VALUES (?, ?)", (psalms_id, 23))
    conn.commit()
    conn.close()

    result = import_bible(
        ImportBibleRequest(
            filename="psalms.xml",
            content="""
                <XMLBIBLE biblename="PsalmAlias">
                  <BIBLEBOOK bname="Psalm">
                    <CHAPTER cnumber="23">
                      <VERS vnumber="1">The LORD is my shepherd.</VERS>
                    </CHAPTER>
                  </BIBLEBOOK>
                </XMLBIBLE>
            """,
        )
    )
    assert result["version"]["verse_count"] == 1


def test_import_creates_missing_chapter(bible_db):
    # John ch.3 is in the fixture, but ch.1 is not.
    # Import should succeed and create the missing chapter row.
    result = import_bible(
        ImportBibleRequest(
            filename="missingchap.xml",
            content="""
                <XMLBIBLE biblename="MissingChap">
                  <BIBLEBOOK bname="John" bsname="JHN">
                    <CHAPTER cnumber="1">
                      <VERS vnumber="1">In the beginning was the Word.</VERS>
                    </CHAPTER>
                  </BIBLEBOOK>
                </XMLBIBLE>
            """,
        )
    )
    assert result["version"]["verse_count"] == 1
