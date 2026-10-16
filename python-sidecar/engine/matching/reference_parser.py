"""Deterministic spoken scripture-reference parser.

Finds references the way a preacher says them and the way Whisper writes them
down, including the damage ASR does along the way:

* book names, aliases and ordinals ("first / 1st / I / 1 Corinthians",
  "Psalm / Psalms", "Song of Solomon / Song of Songs") from the shared table
  `data/bible_books.json` (also read by src/lib/scriptureSearch.ts);
* number words ("three sixteen", "twenty-three", "a hundred and nineteen");
* "chapter X verse Y", "X verse Y", "X:Y", "X.Y", "X, Y", "X Y", and ranges
  ("verses 4 to 7", "4 through 7", "4-7", "5 and 6");
* carry-over from earlier references: "John 3 … verse 17" -> John 3:17,
  "the next verse" -> +1;
* collapsed numbers ("John 316" -> 3:16; "Psalm 2312" resolved by Bible-DB
  validity and context, or dropped when still ambiguous);
* book homophones ("Michael" -> Micah, "June" -> Jude, "hey guy" -> Haggai,
  "X" -> Acts) which, like book names that are also everyday words (Mark,
  Numbers, Job), only count when chapter AND verse numbers follow.

Every reference is validated against the verse counts in bible.db.

`parse_references(text)` is the stateless core. `ReferenceTracker` adds what a
live stream needs: it re-parses a rolling ~15 s window, so a reference split
across two transcription chunks ("John three" | "sixteen") is still found, and
de-duplicates so one spoken reference yields one result.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from functools import lru_cache
from pathlib import Path

BOOKS_PATH = Path(__file__).resolve().parents[2] / "data" / "bible_books.json"

UNITS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
}
TEENS = {
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}
TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fourty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}
CHAPTER_WORDS = frozenset({"chapter", "chapters"})
VERSE_WORDS = frozenset({"verse", "verses"})
RANGE_WORDS = frozenset({"-", "to", "through", "thru", "till", "until"})
MAX_CHAPTER = 150
MAX_VERSE = 176
MAX_RANGE = 40

CONF_EXPLICIT = 0.95
CONF_CARRY = 0.92
CONF_WEAK = 0.9  # homophone / everyday-word book with chapter + verse
CONF_COLLAPSED = 0.85  # "John 316": a single valid split
CONF_COLLAPSED_CTX = 0.8  # several valid splits, context picked one

_TOKEN_RE = re.compile(r"\d+(?:st|nd|rd|th)\b|\d+|[a-z]+(?:'[a-z]+)?|[:.,;\-]")


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _BookEntry:
    name: str
    homophone: bool
    weak: bool


@lru_cache(maxsize=1)
def _book_trie() -> dict:
    """Token-sequence trie: {token: {..., None: [_BookEntry, ...]}}."""
    doc = json.loads(BOOKS_PATH.read_text())
    ordinals = {int(k): v for k, v in doc["ordinals"].items()}
    trie: dict = {}

    def add(tokens: list[str], entry: _BookEntry) -> None:
        node = trie
        for tok in tokens:
            node = node.setdefault(tok, {})
        node.setdefault(None, []).append(entry)

    for book in doc["books"]:
        weak = bool(book.get("weak"))
        forms = [(a, False) for a in book["aliases"]]
        forms += [(h, True) for h in book.get("homophones", [])]
        for form, homophone in forms:
            tokens = _TOKEN_RE.findall(form.lower())
            entry = _BookEntry(book["name"], homophone, weak or homophone)
            if "ordinal" in book:
                for ordinal in ordinals[book["ordinal"]]:
                    add([ordinal, *tokens], entry)
            else:
                add(tokens, entry)
    return trie


@lru_cache(maxsize=1)
def _db_verse_counts() -> dict[str, dict[int, int]]:
    from database import get_connection

    conn = get_connection()
    try:
        rows = conn.execute(
            """
            SELECT b.name, ch.number, MAX(v.verse_number)
            FROM verses v
            JOIN chapters ch ON v.chapter_id = ch.id
            JOIN books b ON ch.book_id = b.id
            GROUP BY b.name, ch.number
            """
        ).fetchall()
    finally:
        conn.close()
    counts: dict[str, dict[int, int]] = {}
    for book, chapter, verses in rows:
        counts.setdefault(book, {})[int(chapter)] = int(verses)
    return counts


_verse_counts_override: dict[str, dict[int, int]] | None = None


def set_verse_counts(counts: dict[str, dict[int, int]] | None) -> None:
    """Override the Bible-DB verse counts (tests)."""
    global _verse_counts_override
    _verse_counts_override = counts


def verse_counts() -> dict[str, dict[int, int]]:
    if _verse_counts_override is not None:
        return _verse_counts_override
    return _db_verse_counts()


def is_valid(
    book: str, chapter: int, verse: int | None = None, verse_end: int | None = None
) -> bool:
    chapters = verse_counts().get(book)
    if not chapters or chapter not in chapters:
        return False
    if verse is None:
        return True
    last = chapters[chapter]
    if not 1 <= verse <= last:
        return False
    return verse_end is None or verse < verse_end <= last


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SpokenRef:
    book: str
    chapter: int
    verse: int | None
    verse_end: int | None = None
    start: int = 0  # char span in the parsed text
    end: int = 0
    confidence: float = CONF_EXPLICIT
    kind: str = "explicit"  # explicit | carry | next | collapsed | homophone | weak
    t: float | None = None  # spoken time of the last word (ReferenceTracker only)
    t_start: float | None = None  # spoken time of the first word

    @property
    def reference(self) -> str:
        if self.verse is None:
            return f"{self.book} {self.chapter}"
        tail = f"-{self.verse_end}" if self.verse_end else ""
        return f"{self.book} {self.chapter}:{self.verse}{tail}"

    @property
    def key(self) -> tuple:
        return (self.book, self.chapter, self.verse)

    def covers(self, book: str, chapter: int, verse: int | None) -> bool:
        """Whether a suggestion for book chapter:verse satisfies this reference."""
        if book != self.book or chapter != self.chapter:
            return False
        if self.verse is None or verse is None:
            return True
        return self.verse <= verse <= (self.verse_end or self.verse)


@dataclass
class RefContext:
    """The passage the speaker is currently in, for carry-over."""

    book: str | None = None
    chapter: int | None = None
    verse: int | None = None

    def update(self, ref: SpokenRef) -> None:
        self.book, self.chapter = ref.book, ref.chapter
        if ref.verse is not None:
            self.verse = ref.verse_end or ref.verse
        else:
            self.verse = None

    def copy(self) -> RefContext:
        return RefContext(self.book, self.chapter, self.verse)


# ---------------------------------------------------------------------------
# Tokenising and number words
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _Tok:
    text: str  # lowercased
    start: int
    end: int
    capitalized: bool = False

    @property
    def is_digits(self) -> bool:
        return self.text.isdigit()


def _tokenize(text: str) -> list[_Tok]:
    norm = text.lower().replace("–", "-").replace("—", "-").replace("’", "'")
    return [
        _Tok(m.group(), m.start(), m.end(), text[m.start()].isupper())
        for m in _TOKEN_RE.finditer(norm)
    ]


def _word(toks: list[_Tok], i: int) -> str | None:
    return toks[i].text if 0 <= i < len(toks) else None


def _sub100(toks: list[_Tok], i: int) -> tuple[int, int] | None:
    w = _word(toks, i)
    if w in TENS:
        value, j = TENS[w], i + 1
        if _word(toks, j) == "-":
            if _word(toks, j + 1) in UNITS and UNITS[toks[j + 1].text] > 0:
                return value + UNITS[toks[j + 1].text], j + 2
            return value, j
        if _word(toks, j) in UNITS and UNITS[toks[j].text] > 0:
            return value + UNITS[toks[j].text], j + 1
        return value, j
    if w in TEENS:
        return TEENS[w], i + 1
    if w in UNITS:
        return UNITS[w], i + 1
    return None


def _number(toks: list[_Tok], i: int) -> tuple[int, int, str | None] | None:
    """Parse one number at i -> (value, next_index, digit_string_or_None)."""
    w = _word(toks, i)
    if w is None:
        return None
    if toks[i].is_digits:
        return int(w), i + 1, w
    # Hundreds: "a hundred and nineteen", "one hundred nineteen", "hundred".
    hundreds, j = None, i
    if w in ("a", "one") and _word(toks, i + 1) == "hundred":
        hundreds, j = 100, i + 2
    elif w in UNITS and UNITS[w] > 0 and _word(toks, i + 1) == "hundred":
        hundreds, j = UNITS[w] * 100, i + 2
    elif w == "hundred":
        hundreds, j = 100, i + 1
    if hundreds is not None:
        k = j + 1 if _word(toks, j) == "and" else j
        rest = _sub100(toks, k)
        if rest is not None:
            return hundreds + rest[0], rest[1], None
        return hundreds, j, None
    sub = _sub100(toks, i)
    if sub is None:
        return None
    return sub[0], sub[1], None


# ---------------------------------------------------------------------------
# Grammar
# ---------------------------------------------------------------------------


def _match_book(toks: list[_Tok], i: int) -> tuple[list[_BookEntry], int] | None:
    node, best, j = _book_trie(), None, i
    while j < len(toks) and toks[j].text in node:
        node = node[toks[j].text]
        j += 1
        if None in node:
            best = (node[None], j)
    return best


def _verse_and_range(toks: list[_Tok], k: int) -> tuple[int, int | None, int, str] | None:
    """After a chapter number at k: (verse, verse_end, next_index, separator)."""
    w = _word(toks, k)
    sep, j = None, k
    if w in (":", "."):
        if k + 1 < len(toks) and toks[k + 1].is_digits:
            sep, j = "colon", k + 1
    elif w == ",":
        j = k + 1
        if _word(toks, j) in VERSE_WORDS:
            j += 1
        sep = "comma"
    elif w in VERSE_WORDS:
        sep, j = "verse", k + 1
    elif w in ("and", "from") and _word(toks, k + 1) in VERSE_WORDS:
        sep, j = "verse", k + 2
    elif w is not None and (toks[k].is_digits or _number(toks, k) is not None):
        sep, j = "bare", k
    if sep is None:
        return None
    num = _number(toks, j)
    if num is None:
        return None
    verse, j, _digits = num
    end = None
    w = _word(toks, j)
    if w in RANGE_WORDS or w == "and":
        k2 = j + 1
        if _word(toks, k2) in VERSE_WORDS:
            k2 += 1
        nxt = _number(toks, k2)
        if nxt is not None and verse < nxt[0] <= verse + (2 if w == "and" else MAX_RANGE):
            end, j = nxt[0], nxt[1]
    return verse, end, j, sep


def _collapsed(
    book: str, digits: str, ctx: RefContext | None
) -> tuple[int, int, int | None, float] | None:
    """Split a run-together "316" into chapter/verse(/end) using DB validity."""
    if len(digits) < 3 or len(digits) > 7:
        return None
    two, three = [], []
    for i in range(1, len(digits)):
        a, b = digits[:i], digits[i:]
        if b.startswith("0"):
            continue
        if is_valid(book, int(a), int(b)):
            two.append((int(a), int(b), None))
        for j in range(i + 1, len(digits)):
            b, c = digits[i:j], digits[j:]
            if b.startswith("0") or c.startswith("0"):
                continue
            if is_valid(book, int(a), int(b), int(c)):
                three.append((int(a), int(b), int(c)))
    candidates = two or three
    if not candidates:
        return None
    if len(candidates) == 1:
        return (*candidates[0], CONF_COLLAPSED)
    if ctx is not None and ctx.book == book:
        in_ctx = [c for c in two + three if c[0] == ctx.chapter]
        if len(in_ctx) == 1:
            return (*in_ctx[0], CONF_COLLAPSED_CTX)
    return None


def _book_ref(toks: list[_Tok], i: int, ctx: RefContext | None) -> tuple[SpokenRef, int] | None:
    match = _match_book(toks, i)
    if match is None:
        return None
    entries, j = match
    entry = next((e for e in entries if not e.homophone), entries[0])
    chapter_word = _word(toks, j) in CHAPTER_WORDS
    if chapter_word:
        j += 1
    num = _number(toks, j)
    if num is None:
        return None
    chapter, k, digits = num
    start, book = toks[i].start, entry.name
    kind = "homophone" if entry.homophone else "weak" if entry.weak else "explicit"
    conf = CONF_WEAK if entry.weak else CONF_EXPLICIT

    tail = _verse_and_range(toks, k)
    # "Mark 5 3" is a reference; "mark 5 3" or "the numbers 1 2 3" is not.
    # Whisper capitalises book names, so a lowercase everyday-word book needs
    # an explicit separator (":" or "verse") or the word "chapter".
    if (
        tail is not None
        and entry.weak
        and tail[3] == "bare"
        and not chapter_word
        and not toks[i].capitalized
    ):
        tail = None
    if tail is not None:
        verse, verse_end, end_i, _sep = tail
        if is_valid(book, chapter, verse, verse_end):
            return SpokenRef(
                book, chapter, verse, verse_end, start, toks[end_i - 1].end, conf, kind
            ), end_i
        if verse_end is not None and is_valid(book, chapter, verse):
            return SpokenRef(
                book, chapter, verse, None, start, toks[end_i - 1].end, conf, kind
            ), end_i

    if digits is not None and not chapter_word and not is_valid(book, chapter):
        split = _collapsed(book, digits, ctx)
        if split is not None:
            c, v, e, split_conf = split
            return SpokenRef(
                book, c, v, e, start, toks[k - 1].end, min(conf, split_conf), "collapsed"
            ), k
        return None

    # Chapter only ("turn to Romans 8"). Everyday-word books and homophones
    # need the word "chapter" before a bare number counts.
    if entry.weak and not chapter_word:
        return None
    if is_valid(book, chapter):
        return SpokenRef(book, chapter, None, None, start, toks[k - 1].end, conf, kind), k
    return None


def _carry_ref(toks: list[_Tok], i: int, ctx: RefContext | None) -> tuple[SpokenRef, int] | None:
    if ctx is None or ctx.book is None:
        return None
    w = _word(toks, i)
    start = toks[i].start
    # "the next verse" / "the following verse"
    if w in ("next", "following") and _word(toks, i + 1) == "verse":
        if ctx.chapter is not None and ctx.verse is not None:
            verse = ctx.verse + 1
            if is_valid(ctx.book, ctx.chapter, verse):
                return SpokenRef(
                    ctx.book, ctx.chapter, verse, None, start, toks[i + 1].end, CONF_CARRY, "next"
                ), i + 2
        return None
    # "chapter 4 verse 2" in the current book
    if w in CHAPTER_WORDS:
        num = _number(toks, i + 1)
        if num is None:
            return None
        chapter, k, _ = num
        tail = _verse_and_range(toks, k)
        if tail is not None and tail[3] != "bare":
            verse, verse_end, end_i, _ = tail
            if is_valid(ctx.book, chapter, verse, verse_end):
                return SpokenRef(
                    ctx.book,
                    chapter,
                    verse,
                    verse_end,
                    start,
                    toks[end_i - 1].end,
                    CONF_CARRY,
                    "carry",
                ), end_i
        if is_valid(ctx.book, chapter):
            return SpokenRef(
                ctx.book, chapter, None, None, start, toks[k - 1].end, CONF_CARRY, "carry"
            ), k
        return None
    # "verse 17", "verses 4 to 7" in the current chapter
    if w in VERSE_WORDS and ctx.chapter is not None:
        tail = _verse_and_range(toks, i)
        if tail is not None:
            verse, verse_end, end_i, _ = tail
            if is_valid(ctx.book, ctx.chapter, verse, verse_end):
                return SpokenRef(
                    ctx.book,
                    ctx.chapter,
                    verse,
                    verse_end,
                    start,
                    toks[end_i - 1].end,
                    CONF_CARRY,
                    "carry",
                ), end_i
    return None


def parse_references(
    text: str, context: RefContext | None = None, include_chapters: bool = False
) -> list[SpokenRef]:
    """All references in `text`, left to right.

    `context` (mutated) supplies and receives the current passage for
    carry-over. Chapter-only references update the context and are returned
    only when `include_chapters` is set.
    """
    toks = _tokenize(text)
    ctx = context if context is not None else RefContext()
    found: list[SpokenRef] = []
    i = 0
    while i < len(toks):
        hit = _book_ref(toks, i, ctx) or _carry_ref(toks, i, ctx)
        if hit is None:
            i += 1
            continue
        ref, i = hit
        ctx.update(ref)
        if ref.verse is not None or include_chapters:
            found.append(ref)
    return found


# ---------------------------------------------------------------------------
# Rolling-window tracker for live text and caption streams
# ---------------------------------------------------------------------------


@dataclass
class _Segment:
    offset: int  # global char offset of the segment's first char
    text: str
    t_start: float
    t_end: float


class ReferenceTracker:
    """Feeds timed text, returns each spoken reference once.

    Re-parses the last `window_seconds` of text on every feed, so a reference
    split across chunks is found once its last part arrives. A reference is
    new unless one with the same book/chapter/verse was already returned for
    an overlapping span or within the last `window_seconds` (a range that
    grows — "13:4" then "13:4-7" — counts as the same reference). Carry-over
    context older than `context_ttl` seconds is forgotten.
    """

    def __init__(self, window_seconds: float = 15.0, context_ttl: float = 300.0) -> None:
        self.window_seconds = window_seconds
        self.context_ttl = context_ttl
        self._segments: list[_Segment] = []
        self._next_offset = 0
        # (global_end, time, context_after) for every reference seen.
        self._history: list[tuple[int, float, RefContext]] = []
        self._emitted: list[SpokenRef] = []  # global spans, with spoken time

    def reset(self) -> None:
        self.__init__(self.window_seconds, self.context_ttl)

    @property
    def context(self) -> RefContext | None:
        return self._history[-1][2].copy() if self._history else None

    def _time_at(self, offset: int) -> float:
        for seg in self._segments:
            if seg.offset <= offset <= seg.offset + len(seg.text):
                if not seg.text:
                    return seg.t_end
                frac = (offset - seg.offset) / len(seg.text)
                return seg.t_start + frac * (seg.t_end - seg.t_start)
        return self._segments[-1].t_end if self._segments else 0.0

    def feed(self, text: str, t_start: float, t_end: float | None = None) -> list[SpokenRef]:
        text = (text or "").strip()
        t_end = t_start if t_end is None else t_end
        if not text:
            return []
        self._segments.append(_Segment(self._next_offset, text, t_start, t_end))
        self._next_offset += len(text) + 1
        while self._segments and t_end - self._segments[0].t_end > self.window_seconds:
            self._segments.pop(0)

        window_start = self._segments[0].offset
        base = next(
            (
                ctx.copy()
                for end, t, ctx in reversed(self._history)
                if end <= window_start and t_end - t <= self.context_ttl
            ),
            RefContext(),
        )
        self._history = [h for h in self._history if h[0] <= window_start]
        joined = " ".join(seg.text for seg in self._segments)
        ctx = base
        new: list[SpokenRef] = []
        for ref in parse_references(joined, ctx, include_chapters=True):
            g_start, g_end = window_start + ref.start, window_start + ref.end
            spoken = self._time_at(g_end)
            self._history.append((g_end, spoken, self._context_after(ref)))
            if ref.verse is None:
                continue
            ref = replace(
                ref,
                start=g_start,
                end=g_end,
                t=round(spoken, 3),
                t_start=round(self._time_at(g_start), 3),
            )
            if self._is_duplicate(ref):
                continue
            self._emitted.append(ref)
            new.append(ref)
        horizon = t_end - max(self.window_seconds, 60.0)
        self._emitted = [r for r in self._emitted if (r.t or 0) >= horizon]
        return new

    @staticmethod
    def _context_after(ref: SpokenRef) -> RefContext:
        ctx = RefContext()
        ctx.update(ref)
        return ctx

    def _is_duplicate(self, ref: SpokenRef) -> bool:
        for old in self._emitted:
            if (old.book, old.chapter, old.verse) != (ref.book, ref.chapter, ref.verse):
                continue
            overlaps = ref.start < old.end and old.start < ref.end
            if overlaps or abs((ref.t or 0) - (old.t or 0)) <= self.window_seconds:
                return True
        return False
