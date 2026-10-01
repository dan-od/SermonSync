"""Book and version alias tables for Bible import / lookup (SS-006)."""

from __future__ import annotations

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
