"""Score a live-feed harness run (SS-072).

Usage:
    python scripts/score_run.py eval_runs/<timestamp>_<slug> [more run dirs...]

Writes report.md, metrics.json and details.json into each run dir and prints
the headline. Drop a hand-corrected `reference.txt` (optional first line
`# window: <start>-<end>`) or an `expected_refs.json` into the run dir, or into
eval/references/<source_id>/, and re-score to use them.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.eval.scoring import score_run_dir  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("run_dirs", nargs="+", type=Path)
    args = parser.parse_args()
    for run_dir in args.run_dirs:
        report = score_run_dir(run_dir)
        headline = json.loads((run_dir / "metrics.json").read_text())["headline"]
        print(f"{run_dir}: {report}")
        for key, value in headline.items():
            print(f"  {key:32} {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
