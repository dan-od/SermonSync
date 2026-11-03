"""Loads a recorded live-feed run for scoring (SS-072)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .intervals import intersect, merge, total

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
    # Source spans actually played, in play order: [[start, end]] unless the
    # feed was seeked, in which case audio between a seek's `from` and `to`
    # was never heard and is not scored.
    played: list[list[float]] = field(default_factory=list)

    @property
    def segments(self) -> list[list[float]]:
        """Played spans, merged (a backward seek can replay audio)."""
        return merge(self.played) if self.played else merge([[self.start, self.end]])

    @property
    def duration(self) -> float:
        return total(self.segments)

    def clip(self, intervals) -> list[list[float]]:
        return intersect(intervals, self.segments)

    def covers(self, t: float) -> bool:
        return any(a <= t < b for a, b in self.segments)


def load_run(run_dir: str | Path) -> Run:
    run_dir = Path(run_dir)
    meta = json.loads((run_dir / "meta.json").read_text())
    events = [
        json.loads(line) for line in (run_dir / "events.jsonl").read_text().splitlines() if line
    ]
    req = meta.get("request", {})
    start = float(req.get("start") or 0.0)
    end_event = next((e for e in reversed(events) if e["type"] == "run_end"), None)
    seeks = [e for e in events if e["type"] == "seek"]
    if end_event and end_event.get("end_position") is not None:
        end = float(end_event["end_position"])
    elif end_event and end_event.get("frames") and not seeks:
        end = start + end_event["frames"] * 0.02
    elif req.get("duration") and not seeks:
        end = start + float(req["duration"])
    else:
        end = max((e["t"] for e in events), default=start)
    played, cursor = [], start
    for e in seeks:
        played.append([cursor, float(e["from"])])
        cursor = float(e["to"])
    played.append([cursor, end])
    played = [[a, b] for a, b in played if b > a]
    run = Run(run_dir, meta, events, start, end, played=played)

    chunks = {e["seq"]: e for e in events if e["type"] == "chunk"}
    for e in events:
        # Inference a seek overtook was never shown.
        if e["type"] != "inference" or e.get("discarded"):
            continue
        chunk = chunks.get(e.get("seq"), {})
        for seg in e.get("segments", []):
            # Segments a hallucination filter dropped were never shown.
            if not (seg.get("text") or "").strip() or seg.get("dropped"):
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
    """Spans where frame_state[key] == value. A seek closes the open span at
    `from`; the pipeline restates its state right after landing at `to`."""
    out, opened = [], None
    for e in run.events:
        if e["type"] == "seek":
            if opened is not None:
                out.append([opened, e["from"]])
                opened = None
            continue
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
