"""What the test-feed seek bar shows for a prepared source (SS-072).

Caption cues (for the hover tooltip) and reference markers: the caption text
run through the same spoken-reference parser the scorer uses to list the
references a run is expected to catch.
"""

from __future__ import annotations

from ..audio.file_source import PreparedSource
from ..matching.reference_parser import ReferenceTracker
from . import captions as cap


def caption_cues(captions: cap.Captions) -> list[dict]:
    return [
        {"start": round(seg.t_start, 2), "end": round(seg.t_end, 2), "text": seg.text}
        for seg in captions.segments
    ]


# How far from the parser's estimate a caption word may be to count as the
# reference's first word.
SNAP_SECONDS = 3.0


def _snap(t: float, book: str, words: list[cap.Word]) -> float:
    """The tracker places a reference by interpolating across its caption
    line; move it onto the caption word that starts the book name."""
    stem = book.split()[-1].lower()[:4]
    near = [w for w in words if abs(w.t - t) <= SNAP_SECONDS and w.text.lower().startswith(stem)]
    return min(near, key=lambda w: abs(w.t - t)).t if near else t


def caption_markers(captions: cap.Captions) -> list[dict]:
    """One marker per reference spoken in the captions, at the moment its
    first word (the book name) is spoken."""
    tracker = ReferenceTracker()
    words = captions.words
    markers: list[dict] = []
    for seg in captions.segments:
        t_end = max(seg.words[-1].t, seg.t_start)
        for ref in tracker.feed(seg.text, seg.words[0].t, t_end):
            t = _snap(ref.t_start if ref.t_start is not None else ref.t, ref.book, words)
            # The reference may start on an earlier caption line than the one
            # that completed it ("… turn to John" / "three sixteen").
            lines = [s.text for s in captions.segments if s.t_end >= t and s.t_start <= ref.t]
            markers.append(
                {
                    "time": round(t, 2),
                    "reference": ref.reference,
                    "caption_text": " ".join(lines) or seg.text,
                }
            )
    return markers


def describe_source(prepared: PreparedSource) -> dict:
    """Duration, title, caption cues and reference markers for `prepared`."""
    captions = (
        cap.parse_vtt(prepared.captions_path) if prepared.captions_path else None
    )
    return {
        "source": prepared.source,
        "title": prepared.title,
        "duration": prepared.media_duration,
        "captions": prepared.captions_kind,
        "cues": caption_cues(captions) if captions else [],
        "markers": caption_markers(captions) if captions else [],
    }
