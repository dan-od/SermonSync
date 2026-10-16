"""Diff the metrics of two scored live-feed runs (SS-072).

Usage:
    python scripts/compare_runs.py <run_a> <run_b> [--all] [--markdown]

Accepts run dirs or metrics.json paths. Prints the headline metrics side by
side with the change; --all adds every numeric metric.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

HEADLINE = [
    ("headline.wer", "WER", -1),
    ("headline.ref_span_wer", "ref-span WER", -1),
    ("headline.vad_recall_pct", "VAD recall %", 1),
    ("headline.vad_false_open_s", "VAD false-open s", -1),
    ("headline.hallucinations_per_10min", "hallucinations/10 min", -1),
    ("headline.refs_precision_pct", "refs precision %", 1),
    ("headline.refs_recall_pct", "refs recall %", 1),
    ("headline.spoken_to_suggestion_median_s", "spoken→suggestion s", -1),
    ("latency.speech_end_to_final_s_median", "speech end→final s", -1),
    ("compute.partial_share_pct", "partial share of inference %", -1),
    ("chunks.median_s", "median chunk s", 0),
    ("worship_gate.blocked_speech_s", "speech blocked by worship gate s", -1),
]


def load(path: str) -> dict:
    p = Path(path)
    if p.is_dir():
        p = p / "metrics.json"
    return json.loads(p.read_text())


def flatten(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(flatten(v, key + "."))
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out[key] = v
    return out


def compare(a: dict, b: dict, include_all: bool = False) -> list[tuple[str, object, object, str]]:
    fa, fb = flatten(a), flatten(b)
    rows = []
    keys = [(k, label, better) for k, label, better in HEADLINE]
    if include_all:
        seen = {k for k, _, _ in keys}
        keys += [(k, k, 0) for k in sorted(set(fa) | set(fb)) if k not in seen]
    for key, label, better in keys:
        va, vb = fa.get(key), fb.get(key)
        if va is None and vb is None:
            continue
        delta = ""
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            diff = vb - va
            arrow = ""
            if better and diff:
                arrow = " ✓" if diff * better > 0 else " ✗"
            delta = f"{diff:+.4g}{arrow}"
        rows.append((label, va, vb, delta))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("a")
    parser.add_argument("b")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    a, b = load(args.a), load(args.b)
    rows = compare(a, b, args.all)
    name_a = a["run"].get("label") or a["run"]["dir"]
    name_b = b["run"].get("label") or b["run"]["dir"]
    if args.markdown:
        print(f"| metric | {name_a} | {name_b} | Δ |\n|---|---|---|---|")
        for label, va, vb, delta in rows:
            print(f"| {label} | {va} | {vb} | {delta} |")
    else:
        width = max(len(r[0]) for r in rows) if rows else 10
        print(f"{'metric':{width}}  {'A':>10}  {'B':>10}  delta")
        print(f"{'':{width}}  A = {name_a}\n{'':{width}}  B = {name_b}")
        for label, va, vb, delta in rows:
            print(f"{label:{width}}  {str(va):>10}  {str(vb):>10}  {delta}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
