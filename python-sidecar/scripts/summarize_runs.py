"""Tabulate the headline metrics of scored live-feed runs (SS-072).

Usage:
    python scripts/summarize_runs.py eval_runs/*_baseline-* [--csv]

One markdown row per run: WER (and what it was measured against), VAD
recall / false-open, hallucinations per 10 min, reference precision / recall,
median spoken→suggestion latency, engine.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

COLUMNS = [
    ("run", lambda m: m["run"].get("label") or m["run"]["dir"]),
    ("WER", lambda m: m["headline"]["wer"]),
    ("WER vs", lambda m: m["headline"]["wer_source"]),
    ("ref-span WER", lambda m: m["headline"]["ref_span_wer"]),
    ("VAD recall %", lambda m: m["headline"]["vad_recall_pct"]),
    ("false-open s", lambda m: m["headline"]["vad_false_open_s"]),
    ("halluc./10min", lambda m: m["headline"]["hallucinations_per_10min"]),
    ("refs P %", lambda m: m["headline"]["refs_precision_pct"]),
    ("refs R %", lambda m: m["headline"]["refs_recall_pct"]),
    ("refs n", lambda m: m["headline"]["refs_expected"]),
    ("spoken→sugg. s", lambda m: m["headline"]["spoken_to_suggestion_median_s"]),
    ("end→final s", lambda m: m.get("latency", {}).get("speech_end_to_final_s_median")),
    ("partial share %", lambda m: m.get("compute", {}).get("partial_share_pct")),
    ("worship-blocked s", lambda m: m.get("worship_gate", {}).get("blocked_speech_s")),
    ("engine", lambda m: m["headline"]["engine"]),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("runs", nargs="+", type=Path)
    parser.add_argument("--csv", action="store_true")
    args = parser.parse_args()
    rows = []
    for run in args.runs:
        path = run / "metrics.json" if run.is_dir() else run
        if not path.exists():
            continue
        m = json.loads(path.read_text())
        rows.append(["—" if (v := get(m)) is None else str(v) for _, get in COLUMNS])
    names = [name for name, _ in COLUMNS]
    if args.csv:
        print(",".join(names))
        for row in rows:
            print(",".join(row))
    else:
        print("| " + " | ".join(names) + " |")
        print("|" + "---|" * len(names))
        for row in rows:
            print("| " + " | ".join(row) + " |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
