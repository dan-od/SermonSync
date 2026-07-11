"""Build the ChromaDB semantic index of KJV verses (SS-020).

Uses sentence-transformers `all-MiniLM-L6-v2` when installed; otherwise falls
back to the deterministic MockEmbedder (feature hashing) so the pipeline flow
works without the model download.

Usage:
    python scripts/build_embeddings.py [--limit N] [--persist data/chroma]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as a script (python scripts/build_embeddings.py).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.matching.semantic_matcher import SemanticMatcher  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the semantic (ChromaDB) index")
    ap.add_argument("--limit", type=int, default=None, help="only embed first N verses")
    ap.add_argument("--persist", default=None, help="ChromaDB persist directory")
    args = ap.parse_args()

    matcher = SemanticMatcher(persist_dir=args.persist)
    embedder = "real (sentence-transformers)"
    if getattr(matcher.embedder, "is_mock", False):
        embedder = "MOCK (feature hashing) — install sentence-transformers for real embeddings"
    print(f"Embedder: {embedder}")
    count = matcher.build_index(limit=args.limit)
    print(f"Indexed {count} verses into ChromaDB ({matcher.count()} total in collection).")


if __name__ == "__main__":
    main()
