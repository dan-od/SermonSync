# Live-feed run: ABC-music_under_preaching

- Source: 1 HOUR NON STOP INTENSE WORSHIP SESSION WITH NEON ADEJO LIVE IN BOSTON 🇺🇸 — https://www.youtube.com/watch?v=lJfWmv3eM7c
- Window: 2400–3000 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2671 (auto captions) | — | 81.1% | 22.7 s | 1.0 | 0.0% / — (n=0) | — |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2671 (S 161, D 88, I 47; 1108 ref words, 1067 hyp words; window [2400.0, 3000.0])
- **Reference spans** (book names + numbers around 0 spoken references): WER — over 0 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 405.7 |
| VAD recall: caption speech that reached Whisper (%) | 81.1 |
| … covered by VAD alone (%) | 72.2 |
| … passed VAD + worship gate (%) | 72.2 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 22.7 |
| false-open per 10 min (s) | 22.74 |
| VAD open (s) | 330.8 |
| forwarded (s) | 330.8 |
| reached Whisper incl. pre-roll (s) | 371.9 |
| stale-dropped (s) | 0.4 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

1 finals (1.0 per 10 min, 1 words) were emitted where captions show no speech; 0 during music.

- 2477.8s “Restoration” (chunk 1.46 s, no_speech 0.2843, logprob -0.3487)

## Chunks sent to Whisper

88 chunks, median 4.08 s, mean 4.29 s. Cut/drop reasons: ceiling 30, pause 58, stale_drop 1

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 14 | 17 | 10 | 8 | 7 | 27 | 2 | 1 | 0 |

## Latency and compute

- Final inference: median 395.65 ms, p90 503.4 ms
- End of chunk audio → final emitted: median 0.92 s, p90 1.36 s
- Inference time: finals 58.5 s, partials 163.6 s (276 passes, 73.7% of all inference); realtime factor 0.37

## Scripture detection

Expected references: 0 (from reference parser over auto captions). Found 0 → recall —. 623 distinct suggestions (623.0 per 10 min), precision 0.0% (top-1 only: 0.0%). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): stage 1: 3 / 0 / 0.0% / 0, stage 2: 346 / 0 / 0.0% / 0, stage 4: 274 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
