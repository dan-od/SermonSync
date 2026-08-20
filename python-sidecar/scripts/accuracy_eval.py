"""Scripture-matching accuracy harness CLI (SS-059).

Runs the curated dataset through the full 4-stage pipeline and prints a report:
end-to-end top-1 accuracy, false positives on adversarial negatives, and
per-stage recall.

Usage:
    python scripts/accuracy_eval.py [--semantic]   # --semantic includes Stage 4
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.eval.accuracy import (  # noqa: E402
    evaluate_orchestrator,
    evaluate_stage,
)
from engine.matching.keyword_matcher import get_matcher as keyword_matcher  # noqa: E402
from engine.matching.llm_matcher import get_matcher as llm_matcher  # noqa: E402
from engine.matching.orchestrator import PipelineOrchestrator  # noqa: E402
from engine.matching.trie_matcher import get_matcher as trie_matcher  # noqa: E402


class _Empty:
    def match(self, *args, **kwargs):
        return []


def main() -> None:
    ap = argparse.ArgumentParser(description="Scripture matching accuracy eval")
    ap.add_argument("--semantic", action="store_true", help="include Stage 4 (slow)")
    args = ap.parse_args()

    semantic = _Empty()
    if args.semantic:
        from engine.matching.semantic_matcher import get_matcher as sem
        semantic = sem()

    orch = PipelineOrchestrator(
        trie=trie_matcher(), keyword=keyword_matcher(),
        llm=llm_matcher(), semantic=semantic,
    )
    m = evaluate_orchestrator(orch)
    print("=== SermonSync scripture matching accuracy ===")
    print(f"Top-1 accuracy : {m['top1_accuracy']:.1%} ({m['correct']}/{m['total_positive']})")
    print(f"False positives: {m['false_positives']}/{m['total_negative']} (>= 0.85 conf)")
    print("\nPer-case (positives):")
    for d in m["positive_detail"]:
        print(f"  [{'HIT ' if d['hit'] else 'MISS'}] {d['text'][:45]:45s} -> {d['top']}")
    print("\nPer-stage recall@k (positives):")
    print(f"  Stage 1 Trie   : {evaluate_stage(trie_matcher())['recall_at_k']:.1%}")
    print(f"  Stage 2 Keyword: {evaluate_stage(keyword_matcher())['recall_at_k']:.1%}")


if __name__ == "__main__":
    main()
