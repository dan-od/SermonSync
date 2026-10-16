# Live-feed run: baseline-explicit_refs_2

- Source: Monday Bible Study  || 5th October, 2026  || Pastor W F Kumuyi — https://www.youtube.com/watch?v=X-iW1iAhJJI
- Window: 3900–4500 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: feat/ss-072-live-feed-harness @ eb1514c

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 1.0 (auto captions) | 1.0 | 0.0% | 0 s | 0.0 | — / 0.0% (n=11) | — |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 1.0 (S 1, D 891, I 0; 892 ref words, 0 hyp words; window [3900.0, 4500.0])
- **Reference spans** (book names + numbers around 11 spoken references): WER 1.0 over 42 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 394.5 |
| VAD recall: caption speech that reached Whisper (%) | 0.0 |
| … covered by VAD alone (%) | 0.0 |
| … passed VAD + worship gate (%) | 0.0 |
| caption speech lost to stale-drop (s) | 0.2 |
| VAD false-open: forwarded with no caption speech (s) | 0 |
| false-open per 10 min (s) | 0.0 |
| VAD open (s) | 0.2 |
| forwarded (s) | 0.2 |
| reached Whisper incl. pre-roll (s) | 0 |
| stale-dropped (s) | 0.3 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

0 chunks, median None s, mean None s. Cut/drop reasons: stale_drop 1

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median — ms, p90 — ms
- End of chunk audio → final emitted: median — s, p90 — s
- Inference time: finals 0.0 s, partials 0.0 s (0 passes, — of all inference); realtime factor 0.0

## Scripture detection

Expected references: 11 (from reference parser over auto captions). Found 0 → recall 0.0%. 0 distinct suggestions (0.0 per 10 min), precision — (top-1 only: —). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): .

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 3918.8 | Mark 16:16 | weak | — | — | — |
| 4022.5 | Joshua 5:7 | carry | — | — | — |
| 4064.0 | Joshua 5:7 | explicit | — | — | — |
| 4089.0 | Joshua 5:8 | carry | — | — | — |
| 4112.6 | Joshua 5:9 | carry | — | — | — |
| 4140.5 | Joshua 5:10 | carry | — | — | — |
| 4198.5 | Joshua 5:9 | carry | — | — | — |
| 4278.4 | Romans 2:28 | explicit | — | — | — |
| 4292.8 | Romans 2:29 | carry | — | — | — |
| 4359.2 | Deuteronomy 13:8 | carry | — | — | — |
| 4473.5 | Colossians 2:11 | carry | — | — | — |
