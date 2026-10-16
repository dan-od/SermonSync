"""WebVTT caption parsing for the run scorer (SS-072).

Handles both caption shapes YouTube serves:

* human-made captions — plain cues; words are spread evenly over each cue;
* auto-generated captions — rolling two-line cues where only the new line
  carries per-word `<00:00:01.234><c> word</c>` timings, followed by repeat
  cues restating the previous line. Only the timed words are kept.

Lines that are only sound tags ("[Music]", "[Applause]") or sung lyrics
("♪ … ♪") are not speech: they become `music_intervals` (for the
hallucination check) and contribute no reference words.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from pathlib import Path

_TIMING = re.compile(
    r"^(?P<start>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s*-->\s*(?P<end>\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})"
)
_INLINE_TS = re.compile(r"<(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})>")
_TAG = re.compile(r"<[^>]+>")
_SOUND_TAG = re.compile(r"\[[^\]]*\]|\([^)]*\)")
# Gap after which consecutive caption words no longer count as one stretch of speech.
SPEECH_GAP_SECONDS = 1.0
WORD_TAIL_SECONDS = 0.4


def parse_ts(value: str) -> float:
    parts = value.replace(",", ".").split(":")
    seconds = float(parts[-1])
    minutes = int(parts[-2]) if len(parts) >= 2 else 0
    hours = int(parts[-3]) if len(parts) >= 3 else 0
    return hours * 3600 + minutes * 60 + seconds


@dataclass
class Word:
    t: float
    text: str


@dataclass
class Segment:
    """A caption line with speech: text plus the span it was spoken in."""

    text: str
    t_start: float
    t_end: float
    words: list[Word] = field(default_factory=list)


@dataclass
class Captions:
    kind: str | None
    segments: list[Segment]
    music_intervals: list[tuple[float, float]]

    @property
    def words(self) -> list[Word]:
        return [w for seg in self.segments for w in seg.words]

    def text_between(self, start: float, end: float) -> str:
        return " ".join(w.text for w in self.words if start <= w.t < end)

    def speech_intervals(self, start: float = 0.0, end: float = float("inf")) -> list[list[float]]:
        """Merged spans where caption words are being spoken."""
        words = [w for w in self.words if start <= w.t < end]
        spans: list[list[float]] = []
        for i, w in enumerate(words):
            nxt = words[i + 1].t if i + 1 < len(words) else None
            stop = (
                nxt
                if nxt is not None and nxt - w.t <= SPEECH_GAP_SECONDS
                else w.t + WORD_TAIL_SECONDS
            )
            stop = min(stop, end)
            if spans and w.t <= spans[-1][1] + 1e-6:
                spans[-1][1] = max(spans[-1][1], stop)
            else:
                spans.append([w.t, stop])
        return spans


def _clean(text: str) -> str:
    text = html.unescape(_TAG.sub("", text))
    return re.sub(r"\s+", " ", text).strip()


def _clean_keep(text: str) -> str:
    """Strip tags and entities but keep spacing exactly."""
    return html.unescape(_TAG.sub("", text))


def _is_music(text: str) -> bool:
    if "♪" in text or "♫" in text:
        return True
    return bool(text) and not _SOUND_TAG.sub("", text).strip()


def _speech_words(text: str) -> list[str]:
    return _SOUND_TAG.sub(" ", text).split()


def _cues(raw: str):
    lines = raw.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        m = _TIMING.match(lines[i].strip())
        if not m:
            i += 1
            continue
        start, end = parse_ts(m.group("start")), parse_ts(m.group("end"))
        i += 1
        body = []
        # A cue ends at a truly empty line; YouTube auto-captions open each
        # cue with a whitespace-only line that must not end it.
        while i < len(lines) and lines[i] != "" and not _TIMING.match(lines[i].strip()):
            body.append(lines[i])
            i += 1
        yield start, end, body


def parse_vtt(path: str | Path, kind: str | None = None) -> Captions:
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    timed = bool(_INLINE_TS.search(raw))
    segments: list[Segment] = []
    music: list[tuple[float, float]] = []
    last_text = None
    for start, end, body in _cues(raw):
        if timed:
            # Auto captions: keep only lines carrying inline word timings,
            # plus a first line without any (the cue's opening word alone).
            for line in body:
                if not _INLINE_TS.search(line):
                    # Sound tags ("[Music]") come as untimed lines; anything
                    # else untimed restates the previous cue's line.
                    if _is_music(_clean(line)):
                        music.append((start, end))
                    continue
                # Concatenate the pieces exactly and give each word the time of
                # its first character: YouTube puts the space inside the piece
                # ("<ts><c> with</c>"), and some uploaders time 2-letter
                # fragments ("yo<ts><c>u </c>"), so pieces are not words.
                pieces = _INLINE_TS.split(line)
                chars: list[tuple[str, float]] = [(c, start) for c in _clean_keep(pieces[0])]
                for ts, chunk in zip(pieces[1::2], pieces[2::2]):
                    at = parse_ts(ts)
                    chars.extend((c, at) for c in _clean_keep(chunk))
                words: list[Word] = []
                current, current_t = "", start
                for c, at in chars + [(" ", start)]:
                    if c.isspace():
                        if current:
                            words.extend(Word(current_t, tok) for tok in _speech_words(current))
                        current = ""
                    else:
                        if not current:
                            current_t = at
                        current += c
                text = _clean(_INLINE_TS.sub("", line))
                if _is_music(text):
                    music.append((start, end))
                    continue
                if words:
                    segments.append(Segment(" ".join(w.text for w in words), start, end, words))
            continue
        text = _clean(" ".join(body))
        if not text or text == last_text:
            continue
        last_text = text
        if _is_music(text):
            music.append((start, end))
            continue
        toks = _speech_words(text)
        if not toks:
            continue
        step = (end - start) / len(toks)
        words = [Word(start + k * step, tok) for k, tok in enumerate(toks)]
        segments.append(Segment(" ".join(toks), start, end, words))

    if timed:
        # Each timed line ends when the next one starts.
        for a, b in zip(segments, segments[1:]):
            a.t_end = max(a.words[-1].t, min(a.t_end, b.t_start))
    return Captions(kind or ("auto" if timed else "human"), segments, music)
