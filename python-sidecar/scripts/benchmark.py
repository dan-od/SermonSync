"""Pipeline performance benchmark (SS-058).

Times index builds, per-stage match latency, Whisper transcription, and
end-to-end orchestration. Prints a report; used to track latency targets and
document hardware specs.

Usage:
    python scripts/benchmark.py [--iters 50] [--whisper]
"""

from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np  # noqa: E402
from engine.eval.accuracy import POSITIVE_CASES  # noqa: E402


def _timed(fn):
    t0 = time.perf_counter()
    result = fn()
    return (time.perf_counter() - t0) * 1000.0, result


def _bench_stage(matcher, sentences, iters):
    times = []
    for _ in range(iters):
        for s in sentences:
            t0 = time.perf_counter()
            matcher.match(s)
            times.append((time.perf_counter() - t0) * 1000.0)
    times.sort()
    return {
        "n": len(times),
        "mean_ms": round(sum(times) / len(times), 2),
        "p50_ms": round(times[len(times) // 2], 2),
        "p95_ms": round(times[int(len(times) * 0.95)], 2),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="SermonSync pipeline benchmark")
    ap.add_argument("--iters", type=int, default=20)
    ap.add_argument("--whisper", action="store_true", help="benchmark transcription")
    args = ap.parse_args()

    sentences = [c.text for c in POSITIVE_CASES]

    print("=== SermonSync pipeline benchmark ===")
    print(f"Host: {platform.platform()} | Python {platform.python_version()}")
    print(f"Sentences: {len(sentences)} | iters: {args.iters}\n")

    from engine.matching.keyword_matcher import get_matcher as kw
    from engine.matching.trie_matcher import get_matcher as trie

    build_trie_ms, trie_m = _timed(lambda: (trie().build_from_db(), trie())[1])
    build_kw_ms, kw_m = _timed(lambda: (kw().build_from_db(), kw())[1])
    print(f"Index build   Trie: {build_trie_ms:8.1f} ms   Keyword: {build_kw_ms:8.1f} ms\n")

    print("Per-stage match latency:")
    print(f"  Stage 1 Trie   : {_bench_stage(trie_m, sentences, args.iters)}")
    print(f"  Stage 2 Keyword: {_bench_stage(kw_m, sentences, args.iters)}")

    from engine.matching.llm_matcher import get_matcher as llm
    print(f"  Stage 3 LLM    : {_bench_stage(llm(), sentences, args.iters)}  (mock)")

    if args.whisper and shutil.which("say"):
        from engine.transcription.whisper_engine import WhisperEngine

        load_ms, engine = _timed(lambda: WhisperEngine.load(["tiny"]))
        wav = "/tmp/ss_bench.wav"
        subprocess.run(
            ["say", "-o", wav, "--data-format=LEI16@16000",
             "For God so loved the world that he gave his only begotten son"],
            check=True, timeout=30,
        )
        with wave.open(wav, "rb") as w:
            raw = w.readframes(w.getnframes())
        audio = np.frombuffer(raw, dtype="<i2").astype("float32") / 32768.0
        secs = len(audio) / 16000.0
        infer_ms, _ = _timed(lambda: engine.transcribe(audio, language="en"))
        print(f"\nWhisper (tiny, CPU): load {load_ms:.0f} ms | "
              f"transcribe {infer_ms:.0f} ms for {secs:.1f}s audio "
              f"({infer_ms / secs / 1000:.2f}x realtime)")

    print("\nNote: Stage 3 (real LLM) + Stage 4 (semantic) latency depend on the "
          "model/GPU; see docs/BENCHMARKS.md for target hardware.")


if __name__ == "__main__":
    main()
