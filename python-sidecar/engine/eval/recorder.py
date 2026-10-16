"""Run recorder for the live-feed test harness (SS-072).

Writes `<run_dir>/events.jsonl`: one JSON object per line, each stamped with
`t` — the source time in seconds (position in the original media) at which the
event happened — plus `rt`, wall seconds since the run started.

Event types:

* `frame_state`  — the VAD decision, worship/scene state or speech gate
  changed (`is_speech`, `scene`, `forward`, `vad_conf`). `t` is the start of
  the frame where the new state began (the clock reads the start of the frame
  being processed while process_frame runs).
* `chunk`        — audio cut and sent to Whisper (`seq`, `reason`
  pause|ceiling, `duration`, `audio_start`/`audio_end`, `intervals`: the source
  spans actually included, pre-roll replays and all).
* `chunk_drop`   — buffered speech discarded without transcription
  (`reason` stale_drop|trim), same span fields.
* `inference`    — a final Whisper pass finished for chunk `seq`: `infer_ms`,
  `latency_ms`, and the raw `segments` (text, no_speech_prob, avg_logprob,
  compression_ratio, …).
* `partial`      — an interim pass: `text`, `infer_ms`, `duration`.
* `ws`           — every WebSocket broadcast except the high-rate meter /
  periodic status events (transcription partials and finals, sentences,
  suggestions, theme updates, test_feed). The payload is under `event`.
* `run_start` / `run_end`.

The recorder is fed from three places: the eval tap (audio thread, event loop,
inference workers), the WS hub listener (event loop), and the feed controller.
All writes go through one lock.
"""

from __future__ import annotations

import bisect
import json
import threading
import time
from pathlib import Path

# Broadcasts that are either high-rate (meter) or periodic restatements of
# state already captured by `frame_state`.
SKIPPED_WS_TYPES = frozenset({"audio_level", "vad_state", "state_change", "system_status"})


def _merge(intervals: list[tuple[float, float]], gap: float = 1e-3) -> list[list[float]]:
    merged: list[list[float]] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1] + gap:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [[round(a, 3), round(b, 3)] for a, b in merged]


class RunRecorder:
    def __init__(
        self, run_dir: Path, clock, frame_seconds: float = 0.02, byte_base: int = 0
    ) -> None:
        """`clock()` returns the current source position in seconds.
        `byte_base` is the transcriber's fed-byte counter when the run began,
        so its chunk offsets can be mapped onto this run's audio."""
        self.run_dir = Path(run_dir)
        self.clock = clock
        self.frame_seconds = frame_seconds
        self.byte_base = byte_base
        self._lock = threading.Lock()
        self._fh = None
        self._wall0 = time.time()
        self._frame_state: tuple | None = None
        # Forwarded audio, in feed order: cumulative byte end -> source span.
        self._sink_ends: list[int] = []
        self._sink_spans: list[tuple[float, float]] = []
        self._sink_bytes = 0
        self.counts: dict[str, int] = {}

    # ------------------------------------------------------------------
    def open(self, meta: dict) -> None:
        self.run_dir.mkdir(parents=True, exist_ok=True)
        (self.run_dir / "meta.json").write_text(json.dumps(meta, indent=2, default=str))
        self._fh = (self.run_dir / "events.jsonl").open("w", encoding="utf-8")
        self._wall0 = time.time()
        self._write("run_start", {"meta": meta})

    def close(self, summary: dict | None = None) -> None:
        with self._lock:
            if self._fh is None:
                return
        self._write("run_end", summary or {})
        with self._lock:
            self._fh.close()
            self._fh = None

    def _write(self, kind: str, fields: dict, t: float | None = None) -> None:
        now = time.time()
        record = {
            "type": kind,
            "t": round(self.clock() if t is None else t, 3),
            "rt": round(now - self._wall0, 3),
            **fields,
        }
        line = json.dumps(record, default=str)
        with self._lock:
            if self._fh is None:
                return
            self._fh.write(line + "\n")
            self.counts[kind] = self.counts.get(kind, 0) + 1

    def flush(self) -> None:
        with self._lock:
            if self._fh is not None:
                self._fh.flush()

    # ------------------------------------------------------------------
    def resolve(self, byte_start: int, byte_end: int) -> list[list[float]]:
        """Source spans covered by fed bytes [byte_start, byte_end)."""
        b0, b1 = byte_start - self.byte_base, byte_end - self.byte_base
        if b1 <= b0:
            return []
        with self._lock:
            ends, spans = self._sink_ends, self._sink_spans
            i = bisect.bisect_right(ends, b0)
            picked = []
            while i < len(ends):
                picked.append(spans[i])
                if ends[i] >= b1:
                    break
                i += 1
        return _merge(picked)

    # Eval tap entry point ---------------------------------------------
    def record(self, kind: str, fields: dict) -> None:
        if kind == "frame":
            state = (fields["is_speech"], fields["scene"], fields["forward"])
            if state != self._frame_state:
                self._frame_state = state
                self._write(
                    "frame_state",
                    {
                        "is_speech": fields["is_speech"],
                        "scene": fields["scene"],
                        "forward": fields["forward"],
                        "vad_conf": fields.get("vad_conf"),
                    },
                    t=self.clock(),
                )
            return
        if kind == "sink":
            # clock() is the start of the frame being processed; a pre-roll
            # replay `back` frames earlier covers an older span.
            start = self.clock() - fields.get("back", 0) * self.frame_seconds
            with self._lock:
                self._sink_bytes += fields["nbytes"]
                self._sink_ends.append(self._sink_bytes)
                self._sink_spans.append((start, start + self.frame_seconds))
            return
        if kind in ("chunk", "chunk_drop"):
            intervals = self.resolve(fields["byte_start"], fields["byte_end"])
            extra = {
                "intervals": intervals,
                "audio_start": intervals[0][0] if intervals else None,
                "audio_end": intervals[-1][1] if intervals else None,
            }
            if "duration" not in fields:
                extra["duration"] = round((fields["byte_end"] - fields["byte_start"]) / 32000, 3)
            self._write(kind, {**fields, **extra})
            return
        self._write(kind, fields)

    # WS hub listener ----------------------------------------------------
    def on_broadcast(self, payload: dict) -> None:
        kind = payload.get("type")
        if kind in SKIPPED_WS_TYPES:
            return
        self._write("ws", {"event": payload})

    def note(self, kind: str, **fields) -> None:
        self._write(kind, fields)
