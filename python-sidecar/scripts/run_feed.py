"""Run a source through the live pipeline via the dev test-feed API (SS-072).

Needs a sidecar started with SERMONSYNC_DEV_FEED=1, e.g.
    SERMONSYNC_DEV_FEED=1 python -m uvicorn main:app --port 8010

Usage:
    python scripts/run_feed.py <source-id | url | path> [--base http://127.0.0.1:8010]
        [--start S] [--duration S] [--speed X] [--label NAME]
        [--set streaming.silence_flush_seconds=0.6 ...] [--monitor]

A source id is looked up in eval/sources.yaml (url/start/duration). Waits for
the run to finish, then prints the run dir and headline metrics (the sidecar
scores the run itself when the dev scoring dependencies are installed).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SIDECAR_DIR = Path(__file__).resolve().parent.parent
SOURCES = SIDECAR_DIR / "eval" / "sources.yaml"


def http(base: str, method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        base + path, data=data, method=method, headers={"content-type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{method} {path} -> {exc.code}: {exc.read().decode()}") from exc


def lookup(source: str) -> dict:
    if "://" in source or Path(source).exists():
        return {"source": source}
    import yaml

    entries = yaml.safe_load(SOURCES.read_text()) or {}
    for entry in entries.get("sources", []):
        if entry.get("id") == source:
            if not entry.get("url"):
                raise SystemExit(f"source {source!r} has no url yet in {SOURCES}")
            return {
                "source": entry["url"],
                "start": entry.get("start", 0),
                "duration": entry.get("duration"),
                "label": entry["id"],
                "captions_human": bool(entry.get("captions_human")),
            }
    raise SystemExit(f"unknown source {source!r} (not a URL, file, or id in {SOURCES})")


def parse_value(raw: str):
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("source")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--start", type=float)
    parser.add_argument("--duration", type=float)
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--label")
    parser.add_argument("--set", action="append", default=[], metavar="TARGET.ATTR=VALUE")
    parser.add_argument("--monitor", action="store_true", help="play the audio out loud")
    parser.add_argument("--sample-rate", type=int, default=48000, help="device rate to emulate")
    args = parser.parse_args()

    body = lookup(args.source)
    for key in ("start", "duration", "label"):
        if getattr(args, key) is not None:
            body[key] = getattr(args, key)
    if args.label and body.get("label") and args.label != body["label"]:
        body["label"] = args.label
    body["speed"] = args.speed
    body["monitor"] = args.monitor
    body["sample_rate"] = args.sample_rate
    body["overrides"] = {k: parse_value(v) for k, v in (item.split("=", 1) for item in args.set)}
    status = http(args.base, "POST", "/api/audio/test-feed", body)
    print(f"started: {body}", flush=True)
    last = None
    while status["state"] in ("loading", "playing", "draining"):
        time.sleep(5)
        status = http(args.base, "GET", "/api/audio/test-feed")
        line = f"{status['state']:9} {status.get('position', 0):8.1f}s  {status.get('title') or ''}"
        if line != last:
            print(line, flush=True)
            last = line
    # The sidecar scores the run itself right after it stops.
    for _ in range(60):
        if status.get("report") or status.get("error") or not status.get("run_dir"):
            break
        time.sleep(2)
        status = http(args.base, "GET", "/api/audio/test-feed")
    print(json.dumps(status, indent=2))
    run_dir = status.get("run_dir")
    if status.get("error"):
        print(f"error: {status['error']}", file=sys.stderr)
    if run_dir and (Path(run_dir) / "metrics.json").exists():
        headline = json.loads((Path(run_dir) / "metrics.json").read_text())["headline"]
        for key, value in headline.items():
            print(f"  {key:32} {value}")
    return 1 if status.get("error") else 0


if __name__ == "__main__":
    raise SystemExit(main())
