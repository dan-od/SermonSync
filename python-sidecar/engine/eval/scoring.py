"""Score a recorded live-feed run (SS-072).

Reads `<run_dir>/events.jsonl` + `meta.json` (+ `captions.vtt`, and optional
`reference.txt` / `expected_refs.json`) and writes `report.md` and
`metrics.json` next to them. CLI: scripts/score_run.py.

Reference text, in priority order:
1. a hand-corrected `reference.txt` for a window of the run — in the run dir
   or `eval/references/<source_id>/reference.txt`. Optional first line
   `# window: <start>-<end>` (source seconds); otherwise the whole run.
2. human-made captions;
3. YouTube auto-captions. These are YouTube's own ASR output, so WER against
   them is reported as "agreement with YouTube ASR", not accuracy.

Expected scripture references come from `expected_refs.json` when present,
otherwise from running the live reference parser over the caption text.

Dev-only: needs jiwer and whisper-normalizer (requirements-dev.txt).
"""

from __future__ import annotations

import json
import re
import statistics
from dataclasses import dataclass, field
from pathlib import Path

import jiwer

from ..matching.reference_parser import ReferenceTracker, SpokenRef
from . import captions as cap

try:
    from whisper_normalizer.english import EnglishTextNormalizer

    _normalizer = EnglishTextNormalizer()
    NORMALIZER = "whisper EnglishTextNormalizer"
except ImportError:  # pragma: no cover
    _normalizer = None
    NORMALIZER = "basic (whisper-normalizer not installed)"

SIDECAR_DIR = Path(__file__).resolve().parents[2]
REFERENCES_DIR = SIDECAR_DIR / "eval" / "references"
CAPTION_PAD = 0.25  # caption timing slop, seconds
HALLUCINATION_SPEECH_FRACTION = 0.2
MATCH_EARLY = 5.0  # a suggestion may precede the caption time by this much
MATCH_LATE = 30.0  # ... or follow it by up to this much
DEDUPE_SECONDS = 30.0
CHUNK_BINS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 15]


def normalize(text: str) -> str:
    if _normalizer is not None:
        return re.sub(r"\s+", " ", _normalizer(text)).strip()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", text.lower())).strip()


# ---------------------------------------------------------------------------
# Interval helpers ([start, end] lists, merged and sorted)
# ---------------------------------------------------------------------------


def merge(intervals) -> list[list[float]]:
    out: list[list[float]] = []
    for a, b in sorted((float(a), float(b)) for a, b in intervals if b > a):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


def total(intervals) -> float:
    return sum(b - a for a, b in intervals)


def intersect(x, y) -> list[list[float]]:
    x, y, out, i, j = merge(x), merge(y), [], 0, 0
    while i < len(x) and j < len(y):
        a, b = max(x[i][0], y[j][0]), min(x[i][1], y[j][1])
        if b > a:
            out.append([a, b])
        if x[i][1] < y[j][1]:
            i += 1
        else:
            j += 1
    return out


def subtract(x, y) -> list[list[float]]:
    out = []
    for a, b in merge(x):
        cur = a
        for c, d in merge(y):
            if d <= cur or c >= b:
                continue
            if c > cur:
                out.append([cur, c])
            cur = max(cur, d)
        if cur < b:
            out.append([cur, b])
    return out


def pad(intervals, amount: float) -> list[list[float]]:
    return merge([a - amount, b + amount] for a, b in intervals)


def clip(intervals, start: float, end: float) -> list[list[float]]:
    return intersect(intervals, [[start, end]])


def _pct(num: float, den: float) -> float | None:
    return round(100.0 * num / den, 1) if den > 0 else None


def _median(values) -> float | None:
    values = list(values)
    return round(statistics.median(values), 3) if values else None


def _p90(values) -> float | None:
    values = sorted(values)
    if not values:
        return None
    return round(values[min(len(values) - 1, int(0.9 * len(values)))], 3)


# ---------------------------------------------------------------------------
# Run loading
# ---------------------------------------------------------------------------


@dataclass
class Final:
    seq: int
    t: float  # emission time (source clock)
    text: str
    no_speech_prob: float | None
    avg_logprob: float | None
    compression_ratio: float | None
    intervals: list[list[float]]
    infer_ms: float | None

    @property
    def span(self) -> tuple[float, float] | None:
        if not self.intervals:
            return None
        return self.intervals[0][0], self.intervals[-1][1]

    @property
    def midpoint(self) -> float:
        span = self.span
        return (span[0] + span[1]) / 2 if span else self.t


@dataclass
class Run:
    run_dir: Path
    meta: dict
    events: list[dict]
    start: float = 0.0
    end: float = 0.0
    finals: list[Final] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


def load_run(run_dir: str | Path) -> Run:
    run_dir = Path(run_dir)
    meta = json.loads((run_dir / "meta.json").read_text())
    events = [
        json.loads(line) for line in (run_dir / "events.jsonl").read_text().splitlines() if line
    ]
    req = meta.get("request", {})
    start = float(req.get("start") or 0.0)
    end_event = next((e for e in reversed(events) if e["type"] == "run_end"), None)
    if end_event and end_event.get("frames"):
        end = start + end_event["frames"] * 0.02
    elif req.get("duration"):
        end = start + float(req["duration"])
    else:
        end = max((e["t"] for e in events), default=start)
    run = Run(run_dir, meta, events, start, end)

    chunks = {e["seq"]: e for e in events if e["type"] == "chunk"}
    for e in events:
        if e["type"] != "inference":
            continue
        chunk = chunks.get(e.get("seq"), {})
        for seg in e.get("segments", []):
            if not (seg.get("text") or "").strip():
                continue
            run.finals.append(
                Final(
                    seq=e.get("seq", 0),
                    t=e["t"],
                    text=seg["text"].strip(),
                    no_speech_prob=seg.get("no_speech_prob"),
                    avg_logprob=seg.get("avg_logprob"),
                    compression_ratio=seg.get("compression_ratio"),
                    intervals=chunk.get("intervals") or [],
                    infer_ms=e.get("infer_ms"),
                )
            )
    # Runs recorded before inference events existed: fall back to WS finals.
    if not any(e["type"] == "inference" for e in events):
        for e in events:
            ev = e.get("event") or {}
            if e["type"] == "ws" and ev.get("type") == "transcription" and ev.get("is_final"):
                run.finals.append(Final(0, e["t"], ev["text"], None, None, None, [], None))
    return run


def state_intervals(run: Run, key: str, value=True) -> list[list[float]]:
    """Spans where frame_state[key] == value."""
    out, opened = [], None
    for e in run.events:
        if e["type"] != "frame_state":
            continue
        on = e.get(key) == value
        if on and opened is None:
            opened = e["t"]
        elif not on and opened is not None:
            out.append([opened, e["t"]])
            opened = None
    if opened is not None:
        out.append([opened, run.end])
    return merge(out)


def event_intervals(run: Run, kind: str, reason: str | None = None) -> list[list[float]]:
    spans = []
    for e in run.events:
        if e["type"] == kind and (reason is None or e.get("reason") == reason):
            spans.extend(e.get("intervals") or [])
    return merge(spans)


# ---------------------------------------------------------------------------
# References
# ---------------------------------------------------------------------------


@dataclass
class Reference:
    source: str  # reference.txt | human captions | auto captions
    label: str
    text: str
    start: float
    end: float


def _find_file(run: Run, name: str) -> Path | None:
    local = run.run_dir / name
    if local.is_file():
        return local
    source_id = (run.meta.get("source") or {}).get("source_id")
    for key in filter(None, [run.meta.get("request", {}).get("label"), source_id]):
        candidate = REFERENCES_DIR / key / name
        if candidate.is_file():
            return candidate
    return None


def load_reference_txt(path: Path, run: Run) -> Reference:
    lines = path.read_text(encoding="utf-8").splitlines()
    start, end = run.start, run.end
    body = []
    for line in lines:
        m = re.match(r"^\s*#\s*window\s*:\s*([\d.]+)\s*-\s*([\d.]+)", line, re.IGNORECASE)
        if m:
            start, end = float(m.group(1)), float(m.group(2))
        elif not line.lstrip().startswith("#"):
            body.append(line)
    return Reference(
        "reference.txt", "accuracy vs hand-corrected reference", " ".join(body), start, end
    )


def load_captions(run: Run) -> cap.Captions | None:
    name = run.meta.get("captions_file")
    path = run.run_dir / name if name else None
    if path is None or not path.is_file():
        return None
    kind = (run.meta.get("source") or {}).get("captions_kind")
    if kind in ("uploaded", "file") and run.meta.get("request", {}).get("captions_human"):
        kind = "human"
    return cap.parse_vtt(path, kind if kind in ("human", "auto", "uploaded") else None)


def caption_reference(captions: cap.Captions, run: Run) -> Reference:
    if captions.kind == "auto":
        label = "agreement with YouTube ASR (auto-captions), not accuracy"
    elif captions.kind == "uploaded":
        label = "agreement with uploaded captions of unverified origin (may be machine-made)"
    else:
        label = "accuracy vs human captions"
    return Reference(
        f"{captions.kind} captions",
        label,
        captions.text_between(run.start, run.end),
        run.start,
        run.end,
    )


def hypothesis_text(run: Run, start: float, end: float) -> str:
    return " ".join(f.text for f in run.finals if start <= f.midpoint < end)


def wer_block(ref: Reference, hyp: str) -> dict:
    r, h = normalize(ref.text), normalize(hyp)
    block = {
        "source": ref.source,
        "label": ref.label,
        "window": [round(ref.start, 2), round(ref.end, 2)],
        "ref_words": len(r.split()),
        "hyp_words": len(h.split()),
    }
    if not r:
        return {**block, "wer": None}
    out = jiwer.process_words(r, h or "<empty>")
    return {
        **block,
        "wer": round(out.wer, 4),
        "substitutions": out.substitutions,
        "deletions": out.deletions,
        "insertions": out.insertions,
        "hits": out.hits,
    }


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
    for p in preds:
        stages[str(p.stage)] = stages.get(str(p.stage), 0) + 1
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
    }


def ref_span_wer(
    captions_ref: Reference, captions: cap.Captions, run: Run, expected: list[Expected]
) -> dict:
    """WER restricted to the words around each spoken reference (book names
    and numbers), via one global alignment of the caption and final text."""
    tokens: list[tuple[float, str]] = []
    for seg in captions.segments:
        words = [w for w in seg.words if captions_ref.start <= w.t < captions_ref.end]
        if not words:
            continue
        norm = normalize(" ".join(w.text for w in words)).split()
        t0, t1 = words[0].t, words[-1].t
        for k, tok in enumerate(norm):
            tokens.append((t0 + (t1 - t0) * k / max(1, len(norm) - 1), tok))
    spans = merge([x.t_start - 0.5, x.t + 0.5] for x in expected)
    in_span = [any(a <= t <= b for a, b in spans) for t, _ in tokens]
    n = sum(in_span)
    if not tokens or n == 0:
        return {"ref_words": 0, "wer": None, "spans": len(spans)}
    hyp = normalize(hypothesis_text(run, captions_ref.start, captions_ref.end)) or "<empty>"
    out = jiwer.process_words(" ".join(t for _, t in tokens), hyp)
    s = d = i = 0
    for chunk in out.alignments[0]:
        idx = range(chunk.ref_start_idx, chunk.ref_end_idx)
        if chunk.type == "substitute":
            s += sum(in_span[k] for k in idx)
        elif chunk.type == "delete":
            d += sum(in_span[k] for k in idx)
        elif chunk.type == "insert":
            k = chunk.ref_start_idx
            near = (k < len(in_span) and in_span[k]) or (k > 0 and in_span[k - 1])
            i += (chunk.hyp_end_idx - chunk.hyp_start_idx) if near else 0
    return {
        "ref_words": n,
        "spans": len(spans),
        "wer": round((s + d + i) / n, 4),
        "substitutions": s,
        "deletions": d,
        "insertions": i,
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def score_run(run: Run) -> tuple[dict, dict]:
    """Returns (metrics, details) for a loaded run."""
    meta, window = run.meta, run.duration
    engine = meta.get("engine") or {}
    source = meta.get("source") or {}
    per10 = (lambda x: round(x * 600 / window, 2)) if window else (lambda x: None)
    metrics: dict = {
        "run": {
            "dir": run.run_dir.name,
            "label": meta.get("request", {}).get("label"),
            "title": source.get("title"),
            "source": source.get("url") or source.get("source"),
            "window": [round(run.start, 2), round(run.end, 2)],
            "duration_s": round(window, 1),
            "speed": meta.get("request", {}).get("speed"),
            "overrides": meta.get("request", {}).get("overrides") or {},
            "captions": source.get("captions_kind"),
            "engine": {
                "model": engine.get("loaded_model") or engine.get("configured_model"),
                "device": engine.get("device"),
                "compute_type": engine.get("compute_type"),
                "backend": engine.get("backend", "faster-whisper"),
            },
            "vad": (meta.get("pipeline") or {}).get("vad", {}).get("type"),
            "git": meta.get("git"),
            "normalizer": NORMALIZER,
        }
    }
    details: dict = {}
    captions = load_captions(run)

    # --- WER ---------------------------------------------------------------
    wer: dict = {}
    ref_path = _find_file(run, "reference.txt")
    if ref_path is not None:
        ref = load_reference_txt(ref_path, run)
        wer["reference"] = wer_block(ref, hypothesis_text(run, ref.start, ref.end))
    captions_ref = caption_reference(captions, run) if captions else None
    if captions_ref is not None:
        wer["captions"] = wer_block(captions_ref, hypothesis_text(run, run.start, run.end))
    wer["primary"] = (
        "reference" if "reference" in wer else "captions" if "captions" in wer else None
    )
    metrics["wer"] = wer

    # --- VAD / gate / drops ------------------------------------------------
    is_speech = clip(state_intervals(run, "is_speech"), run.start, run.end)
    forwarded = clip(state_intervals(run, "forward"), run.start, run.end)
    worship = clip(state_intervals(run, "scene", "worship"), run.start, run.end)
    reached = clip(event_intervals(run, "chunk"), run.start, run.end)
    stale = clip(event_intervals(run, "chunk_drop", "stale_drop"), run.start, run.end)
    trimmed = clip(event_intervals(run, "chunk_drop", "trim"), run.start, run.end)
    vad: dict = {
        "vad_open_s": round(total(is_speech), 1),
        "forwarded_s": round(total(forwarded), 1),
        "reached_whisper_s": round(total(reached), 1),
        "stale_dropped_s": round(total(stale), 1),
        "trimmed_s": round(total(trimmed), 1),
        "worship_s": round(total(worship), 1),
    }
    speech = []
    if captions is not None:
        speech = captions.speech_intervals(run.start, run.end)
        speech_total = total(speech)
        padded = pad(speech, CAPTION_PAD)
        vad.update(
            {
                "caption_speech_s": round(speech_total, 1),
                "recall": _pct(total(intersect(speech, reached)), speech_total),
                "recall_vad_only": _pct(total(intersect(speech, is_speech)), speech_total),
                "recall_gate": _pct(total(intersect(speech, forwarded)), speech_total),
                "false_open_s": round(total(subtract(forwarded, padded)), 1),
                "false_open_s_per_10min": per10(total(subtract(forwarded, padded))),
                "speech_lost_to_stale_drop_s": round(total(intersect(speech, stale)), 1),
            }
        )
        # F: caption speech the worship gate blocked although VAD heard speech.
        metrics["worship_gate"] = {
            "caption_speech_in_worship_s": round(total(intersect(speech, worship)), 1),
            "blocked_speech_s": round(total(intersect(intersect(speech, is_speech), worship)), 1),
            "blocked_pct_of_speech": _pct(
                total(intersect(intersect(speech, is_speech), worship)), speech_total
            ),
        }
    metrics["vad"] = vad

    # --- Hallucinations ----------------------------------------------------
    if captions is not None:
        padded = pad(speech, CAPTION_PAD)
        music = merge(captions.music_intervals)
        halluc = []
        for f in run.finals:
            if not (run.start <= f.midpoint < run.end) or not f.intervals:
                continue
            dur = total(f.intervals)
            overlap = total(intersect(f.intervals, padded))
            if overlap < HALLUCINATION_SPEECH_FRACTION * dur:
                halluc.append(
                    {
                        "t": f.t,
                        "text": f.text,
                        "chunk_s": round(dur, 2),
                        "speech_overlap_s": round(overlap, 2),
                        "during_music": total(intersect(f.intervals, music)) > 0,
                        "no_speech_prob": f.no_speech_prob,
                        "avg_logprob": f.avg_logprob,
                    }
                )
        metrics["hallucinations"] = {
            "count": len(halluc),
            "per_10min": per10(len(halluc)),
            "during_music": sum(h["during_music"] for h in halluc),
            "words": sum(len(h["text"].split()) for h in halluc),
        }
        details["hallucinations"] = halluc

    # --- Chunks --------------------------------------------------------------
    chunks = [e for e in run.events if e["type"] == "chunk"]
    drops = [e for e in run.events if e["type"] == "chunk_drop"]
    hist = {}
    for lo, hi in zip(CHUNK_BINS, CHUNK_BINS[1:] + [None]):
        label = f"{lo}-{hi}s" if hi else f"{lo}s+"
        hist[label] = sum(
            1 for c in chunks if c["duration"] >= lo and (hi is None or c["duration"] < hi)
        )
    reasons: dict[str, int] = {}
    for c in chunks + drops:
        reasons[c["reason"]] = reasons.get(c["reason"], 0) + 1
    metrics["chunks"] = {
        "count": len(chunks),
        "median_s": _median(c["duration"] for c in chunks),
        "mean_s": round(sum(c["duration"] for c in chunks) / len(chunks), 2) if chunks else None,
        "reasons": reasons,
        "histogram": hist,
    }

    # --- Latency and compute -------------------------------------------------
    inferences = [e for e in run.events if e["type"] == "inference"]
    partials = [e for e in run.events if e["type"] == "partial"]
    chunk_by_seq = {c["seq"]: c for c in chunks}
    tail = [
        e["t"] - chunk_by_seq[e["seq"]]["audio_end"]
        for e in inferences
        if e.get("seq") in chunk_by_seq and chunk_by_seq[e["seq"]].get("audio_end") is not None
    ]
    final_s = sum(e.get("infer_ms") or 0 for e in inferences) / 1000
    partial_s = sum(e.get("infer_ms") or 0 for e in partials) / 1000
    metrics["latency"] = {
        "final_infer_ms_median": _median(e["infer_ms"] for e in inferences if e.get("infer_ms")),
        "final_infer_ms_p90": _p90(e["infer_ms"] for e in inferences if e.get("infer_ms")),
        "speech_end_to_final_s_median": _median(tail),
        "speech_end_to_final_s_p90": _p90(tail),
    }
    metrics["compute"] = {
        "final_inference_s": round(final_s, 1),
        "partial_inference_s": round(partial_s, 1),
        "partial_count": len(partials),
        "partial_infer_ms_median": _median(e["infer_ms"] for e in partials if e.get("infer_ms")),
        "partial_share_pct": _pct(partial_s, final_s + partial_s),
        "inference_realtime_factor": round((final_s + partial_s) / window, 3) if window else None,
    }

    # --- Detection -----------------------------------------------------------
    exp_path = _find_file(run, "expected_refs.json")
    expected: list[Expected] = []
    exp_source = None
    if exp_path is not None:
        expected = [x for x in expected_from_json(exp_path) if run.start <= x.t < run.end]
        exp_source = f"expected_refs.json ({exp_path})"
    elif captions is not None:
        expected = expected_from_captions(captions, run.start, run.end)
        exp_source = f"reference parser over {captions.kind} captions"
    preds = predictions(run)
    det = detection(expected, preds, window)
    det["expected_source"] = exp_source
    if exp_source is None:
        # Nothing to score suggestions against: precision is unknown, not 0.
        det["precision"] = det["precision_top1"] = None
    metrics["detection"] = det
    details["expected"] = [
        {
            "ref": x.ref.reference,
            "t": x.t,
            "kind": x.ref.kind,
            "hit_t": x.hit_t,
            "latency_s": round(x.hit_t - x.t, 2) if x.hit_t is not None else None,
            "stage": x.hit_stage,
        }
        for x in expected
    ]
    details["predictions"] = [
        {
            "t": p.t,
            "ref": f"{p.book} {p.chapter}:{p.verse}",
            "stage": p.stage,
            "confidence": p.confidence,
            "rank": p.rank,
            "matched": p.matched,
        }
        for p in preds
    ]
    if captions is not None and captions_ref is not None:
        metrics["wer"]["ref_spans"] = ref_span_wer(captions_ref, captions, run, expected)

    metrics["headline"] = headline(metrics)
    return metrics, details


def headline(m: dict) -> dict:
    wer = m.get("wer", {})
    primary = wer.get(wer.get("primary") or "", {}) if wer.get("primary") else {}
    det = m.get("detection", {})
    eng = m["run"]["engine"]
    return {
        "wer": primary.get("wer"),
        "wer_source": primary.get("source"),
        "ref_span_wer": wer.get("ref_spans", {}).get("wer"),
        "vad_recall_pct": m.get("vad", {}).get("recall"),
        "vad_false_open_s": m.get("vad", {}).get("false_open_s"),
        "hallucinations_per_10min": m.get("hallucinations", {}).get("per_10min"),
        "refs_expected": det.get("expected"),
        "refs_precision_pct": det.get("precision"),
        "refs_recall_pct": det.get("recall"),
        "spoken_to_suggestion_median_s": det.get("latency_median_s"),
        "engine": "{}/{}/{}-{}".format(
            eng.get("backend"), eng.get("model"), eng.get("device"), eng.get("compute_type")
        ),
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "—"
    return f"{value}{suffix}"


def render_report(metrics: dict, details: dict) -> str:
    r, h = metrics["run"], metrics["headline"]
    wer = metrics.get("wer", {})
    lines = [
        f"# Live-feed run: {r.get('label') or r.get('title')}",
        "",
        f"- Source: {r.get('title')} — {r.get('source')}",
        f"- Window: {r['window'][0]:.0f}–{r['window'][1]:.0f} s ({r['duration_s']} s) at speed "
        f"{r.get('speed')}"
        + (
            ""
            if r.get("speed") in (1, 1.0, None)
            else " — **latency figures invalid (speed ≠ 1.0)**"
        ),
        f"- Engine: {h['engine']} · VAD: {r.get('vad')} · captions: {r.get('captions')}",
        f"- Git: {(r.get('git') or {}).get('branch')} @ {(r.get('git') or {}).get('commit')}"
        + (" (dirty)" if (r.get("git") or {}).get("dirty") else ""),
    ]
    if r.get("overrides"):
        lines.append(f"- Overrides: `{json.dumps(r['overrides'])}`")
    lines += [
        "",
        "## Headline",
        "",
        "| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | "
        "spoken→suggestion (median) |",
        "|---|---|---|---|---|---|---|",
        f"| {_fmt(h['wer'])} ({h.get('wer_source')}) | {_fmt(h['ref_span_wer'])} | "
        f"{_fmt(h['vad_recall_pct'], '%')} "
        f"| {_fmt(h['vad_false_open_s'], ' s')} | {_fmt(h['hallucinations_per_10min'])} "
        f"| {_fmt(h['refs_precision_pct'], '%')} / {_fmt(h['refs_recall_pct'], '%')} "
        f"(n={h['refs_expected']}) "
        f"| {_fmt(h['spoken_to_suggestion_median_s'], ' s')} |",
        "",
        "## WER",
        "",
    ]
    for key in ("reference", "captions"):
        if key in wer:
            w = wer[key]
            lines.append(
                f"- **{w['source']}** — {w['label']}: WER {_fmt(w.get('wer'))} "
                f"(S {w.get('substitutions')}, D {w.get('deletions')}, I {w.get('insertions')}; "
                f"{w['ref_words']} ref words, {w['hyp_words']} hyp words; window {w['window']})"
            )
    if "ref_spans" in wer:
        s = wer["ref_spans"]
        lines.append(
            f"- **Reference spans** (book names + numbers around {s.get('spans')} spoken "
            f"references): "
            f"WER {_fmt(s.get('wer'))} over {s.get('ref_words')} words"
        )
    lines.append(f"- Normalizer: {r.get('normalizer')}")
    v = metrics.get("vad", {})
    lines += [
        "",
        "## VAD and gating",
        "",
        "| metric | value |",
        "|---|---|",
    ]
    labels = {
        "caption_speech_s": "caption speech (s)",
        "recall": "VAD recall: caption speech that reached Whisper (%)",
        "recall_vad_only": "… covered by VAD alone (%)",
        "recall_gate": "… passed VAD + worship gate (%)",
        "speech_lost_to_stale_drop_s": "caption speech lost to stale-drop (s)",
        "false_open_s": "VAD false-open: forwarded with no caption speech (s)",
        "false_open_s_per_10min": "false-open per 10 min (s)",
        "vad_open_s": "VAD open (s)",
        "forwarded_s": "forwarded (s)",
        "reached_whisper_s": "reached Whisper incl. pre-roll (s)",
        "stale_dropped_s": "stale-dropped (s)",
        "trimmed_s": "trimmed (s)",
        "worship_s": "scene = WORSHIP (s)",
    }
    for k, label in labels.items():
        if k in v:
            lines.append(f"| {label} | {_fmt(v[k])} |")
    if "worship_gate" in metrics:
        wg = metrics["worship_gate"]
        lines += [
            "",
            f"**Worship gate (F):** {wg['blocked_speech_s']} s of caption speech that VAD heard "
            f"was blocked "
            f"because the scene was WORSHIP ({_fmt(wg['blocked_pct_of_speech'], '%')} of "
            f"caption speech); "
            f"{wg['caption_speech_in_worship_s']} s of caption speech fell in WORSHIP overall.",
        ]
    if "hallucinations" in metrics:
        hm = metrics["hallucinations"]
        lines += [
            "",
            "## Hallucinations",
            "",
            f"{hm['count']} finals ({hm['per_10min']} per 10 min, {hm['words']} words) were "
            f"emitted where captions "
            f"show no speech; {hm['during_music']} during music.",
            "",
        ]
        for item in details.get("hallucinations", [])[:25]:
            lines.append(
                f"- {item['t']:.1f}s “{item['text']}” (chunk {item['chunk_s']} s, "
                f"no_speech {item['no_speech_prob']}, logprob {item['avg_logprob']}"
                + (", music" if item["during_music"] else "")
                + ")"
            )
    c = metrics["chunks"]
    lines += [
        "",
        "## Chunks sent to Whisper",
        "",
        f"{c['count']} chunks, median {c['median_s']} s, mean {c['mean_s']} s. Cut/drop reasons: "
        + ", ".join(f"{k} {n}" for k, n in sorted(c["reasons"].items())),
        "",
        "| " + " | ".join(c["histogram"]) + " |",
        "|" + "---|" * len(c["histogram"]),
        "| " + " | ".join(str(n) for n in c["histogram"].values()) + " |",
    ]
    lat, comp = metrics["latency"], metrics["compute"]
    lines += [
        "",
        "## Latency and compute",
        "",
        f"- Final inference: median {_fmt(lat['final_infer_ms_median'])} ms, p90 "
        f"{_fmt(lat['final_infer_ms_p90'])} ms",
        f"- End of chunk audio → final emitted: median "
        f"{_fmt(lat['speech_end_to_final_s_median'])} s, "
        f"p90 {_fmt(lat['speech_end_to_final_s_p90'])} s",
        f"- Inference time: finals {comp['final_inference_s']} s, partials "
        f"{comp['partial_inference_s']} s "
        f"({comp['partial_count']} passes, {_fmt(comp['partial_share_pct'], '%')} of all "
        f"inference); "
        f"realtime factor {comp['inference_realtime_factor']}",
    ]
    d = metrics["detection"]
    lines += [
        "",
        "## Scripture detection",
        "",
        f"Expected references: {d['expected']} (from {d.get('expected_source')}). "
        f"Found {d['found']} → recall {_fmt(d['recall'], '%')}. "
        f"{d['suggestions']} distinct suggestions ({d['suggestions_per_10min']} per 10 min), "
        f"precision "
        f"{_fmt(d['precision'], '%')} (top-1 only: {_fmt(d['precision_top1'], '%')}). "
        f"Spoken → suggestion: median {_fmt(d['latency_median_s'], ' s')}, mean "
        f"{_fmt(d['latency_mean_s'], ' s')}. "
        f"By stage: {d['stages']}.",
        "",
        "Precision counts every distinct suggestion against explicitly spoken references only, so "
        "allusion matches from stages 2–4 count as misses even when they are reasonable.",
        "",
        "| spoken at | expected | via | suggested at | latency | stage |",
        "|---|---|---|---|---|---|",
    ]
    for x in details.get("expected", []):
        lines.append(
            f"| {x['t']:.1f} | {x['ref']} | {x['kind']} | {_fmt(x['hit_t'])} | "
            f"{_fmt(x['latency_s'], ' s')} "
            f"| {_fmt(x['stage'])} |"
        )
    return "\n".join(lines) + "\n"


def score_run_dir(run_dir: str | Path) -> Path:
    run = load_run(run_dir)
    metrics, details = score_run(run)
    out = Path(run_dir)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (out / "details.json").write_text(json.dumps(details, indent=2))
    report = out / "report.md"
    report.write_text(render_report(metrics, details))
    return report
