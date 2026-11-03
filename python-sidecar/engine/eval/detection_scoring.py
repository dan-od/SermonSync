"""Reference detection precision, recall and latency scoring (SS-072)."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from ..matching.reference_parser import ReferenceTracker, SpokenRef
from . import captions as cap
from .intervals import _median, _pct
from .run_data import Run

MATCH_EARLY = 5.0  # a suggestion may precede the caption time by this much


MATCH_LATE = 30.0  # ... or follow it by up to this much


DEDUPE_SECONDS = 30.0


# ---------------------------------------------------------------------------
# Expected references and detection
# ---------------------------------------------------------------------------


@dataclass
class Expected:
    ref: SpokenRef
    t: float
    t_start: float
    hit_t: float | None = None
    hit_stage: int | None = None


def expected_from_captions(captions: cap.Captions, start: float, end: float) -> list[Expected]:
    tracker = ReferenceTracker()
    out = []
    for seg in captions.segments:
        if seg.t_end < start - 30 or seg.t_start >= end:
            continue
        for ref in tracker.feed(seg.text, seg.words[0].t, max(seg.words[-1].t, seg.t_start)):
            if start <= (ref.t or 0) < end:
                out.append(Expected(ref, ref.t, ref.t_start if ref.t_start is not None else ref.t))
    return out


_REF_STR = re.compile(r"^(?P<book>.+?)\s+(?P<ch>\d+)(?::(?P<v>\d+)(?:-(?P<e>\d+))?)?$")


def expected_from_json(path: Path) -> list[Expected]:
    out = []
    for item in json.loads(path.read_text()):
        if "ref" in item:
            m = _REF_STR.match(item["ref"].strip())
            if not m:
                raise ValueError(f"bad reference {item['ref']!r} in {path}")
            book, ch, v, e = m["book"], int(m["ch"]), m["v"], m["e"]
            ref = SpokenRef(book, ch, int(v) if v else None, int(e) if e else None)
        else:
            ref = SpokenRef(
                item["book"], int(item["chapter"]), item.get("verse"), item.get("verse_end")
            )
        t = float(item["t"])
        out.append(Expected(ref, t, float(item.get("t_start", t))))
    return out


@dataclass
class Prediction:
    t: float
    book: str
    chapter: int
    verse: int
    stage: int | None
    confidence: float | None
    rank: int
    matched: bool = False


def predictions(run: Run) -> list[Prediction]:
    """Distinct suggestions: the same verse again within DEDUPE_SECONDS is one."""
    out: list[Prediction] = []
    last: dict[tuple, float] = {}
    for e in run.events:
        ev = e.get("event") or {}
        if e["type"] != "ws" or ev.get("type") != "suggestions":
            continue
        for rank, r in enumerate(ev.get("results", [])):
            key = (r["book"], r["chapter"], r["verse"])
            if key in last and e["t"] - last[key] <= DEDUPE_SECONDS:
                continue
            last[key] = e["t"]
            out.append(
                Prediction(
                    e["t"],
                    r["book"],
                    r["chapter"],
                    r["verse"],
                    r.get("stage"),
                    r.get("confidence"),
                    rank,
                )
            )
    return out


def detection(expected: list[Expected], preds: list[Prediction], window: float) -> dict:
    verse_level = [x for x in expected if x.ref.verse is not None]
    for x in verse_level:
        for p in preds:
            if x.t - MATCH_EARLY <= p.t <= x.t + MATCH_LATE and x.ref.covers(
                p.book, p.chapter, p.verse
            ):
                p.matched = True
                if x.hit_t is None or p.t < x.hit_t:
                    x.hit_t, x.hit_stage = p.t, p.stage
    hits = [x for x in verse_level if x.hit_t is not None]
    latencies = [x.hit_t - x.t for x in hits]
    top1 = [p for p in preds if p.rank == 0]
    stages: dict[str, int] = {}
    by_stage: dict[str, dict] = {}
    for p in preds:
        key = str(p.stage)
        stages[key] = stages.get(key, 0) + 1
        entry = by_stage.setdefault(key, {"suggestions": 0, "matched": 0})
        entry["suggestions"] += 1
        entry["matched"] += int(p.matched)
    for key, entry in by_stage.items():
        entry["precision"] = _pct(entry["matched"], entry["suggestions"])
        entry["found"] = sum(1 for x in hits if str(x.hit_stage) == key)
    return {
        "expected": len(verse_level),
        "found": len(hits),
        "recall": _pct(len(hits), len(verse_level)),
        "suggestions": len(preds),
        "suggestions_per_10min": round(len(preds) * 600 / window, 1) if window else None,
        "precision": _pct(sum(p.matched for p in preds), len(preds)),
        "precision_top1": _pct(sum(p.matched for p in top1), len(top1)),
        "latency_median_s": _median(latencies),
        "latency_mean_s": round(sum(latencies) / len(latencies), 3) if latencies else None,
        "stages": stages,
        # Precision per stage: Stage 0 names verses outright; stages 2-4
        # suggest allusions, which explicit references cannot confirm.
        "by_stage": by_stage,
    }
