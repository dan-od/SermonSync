# SermonSync — Performance Benchmarks (SS-058)

Reproduce with:

```bash
cd python-sidecar
python scripts/benchmark.py --iters 30 --whisper
```

## Latency budget (target: end-to-end < 2000 ms; alert threshold in SS-015)

```
audio capture → VAD → Whisper → sentence assembly → 4-stage match → suggestion
```

The dominant cost is **Whisper transcription** (and, when enabled, the real
**Stage 3 LLM**). The lexical stages (Trie/Keyword) are effectively free.

## Measured — Apple M-series, CPU only, Python 3.9 (dev reference)

| Component | Cost | Notes |
|---|---|---|
| Trie index build | ~1350 ms | one-time at startup (31,100 verses) |
| Keyword index build | ~670 ms | one-time at startup |
| Stage 1 — Trie match | **0.02 ms** p50 | per sentence |
| Stage 2 — Keyword (BM25) | **13.6 ms** p50 / 44.6 ms p95 | per sentence |
| Stage 3 — LLM (mock) | 0.15 ms p50 | real model is GPU-bound (below) |
| Whisper `tiny`, CPU | 339 ms for 4.0 s audio (**0.09× realtime**) | + ~870 ms one-time load |

Lexical matching is negligible; the pipeline is bounded by ASR + the optional
real LLM.

## Target hardware scenarios

Real Stage 3 (Qwen3-30B GGUF) and Stage 4 (sentence-transformers) were not
downloaded in the dev environment; expected ranges by GPU:

| GPU | Whisper large-v3-turbo | LLM Stage 3 (30B Q4) | Verdict |
|---|---|---|---|
| **CPU only** | ~0.3–0.6× realtime (tiny/base only) | not recommended (use Groq) | dev / small units |
| **GTX 1660 (6 GB)** | near realtime (base/small) | offload partial; prefer 8B or Groq | **minimum** |
| **RTX 3060 (12 GB)** | comfortably realtime (large-v3-turbo) | 8B local / 30B partial | **recommended** |
| **RTX 4090 (24 GB)** | faster-than-realtime | 30B fully on-GPU | ideal |

When local GPU is insufficient, the **Groq cloud fallback (SS-050)** provides
Stage 3 with sub-second inference (network permitting), and the pipeline stays
offline-first for everything else.

## Minimum vs recommended specs

- **Minimum:** 4-core CPU, 8 GB RAM, GTX 1660 (6 GB) — Whisper base + Groq LLM.
- **Recommended:** 6-core CPU, 16 GB RAM, RTX 3060 (12 GB) — Whisper
  large-v3-turbo + local 8B, or 30B via Groq.

## Optimization notes

- Indexes build once at startup (~2 s total); matching is real-time thereafter.
- The 4-stage cascade short-circuits (SS-021), so most sentences never reach the
  expensive LLM/semantic stages.
- CUDA is auto-detected (`float16`), CPU falls back to `int8` (SS-013).
