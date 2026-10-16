# Live-feed run: ABC-explicit_refs_2

- Source: Monday Bible Study  || 5th October, 2026  || Pastor W F Kumuyi — https://www.youtube.com/watch?v=X-iW1iAhJJI
- Window: 3900–4500 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.5504 (auto captions) | 0.5714 | 100.0% | 93.2 s | 0.0 | 0.5% / 36.4% (n=11) | 14.321 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.5504 (S 314, D 47, I 130; 892 ref words, 975 hyp words; window [3900.0, 4500.0])
- **Reference spans** (book names + numbers around 11 spoken references): WER 0.5714 over 42 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 394.5 |
| VAD recall: caption speech that reached Whisper (%) | 100.0 |
| … covered by VAD alone (%) | 99.3 |
| … passed VAD + worship gate (%) | 99.3 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 93.2 |
| false-open per 10 min (s) | 93.17 |
| VAD open (s) | 574.1 |
| forwarded (s) | 574.1 |
| reached Whisper incl. pre-roll (s) | 593.6 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

93 chunks, median 6.4 s, mean 6.6 s. Cut/drop reasons: ceiling 90, pause 3

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 2 | 0 | 0 | 0 | 81 | 8 | 1 | 0 |

## Latency and compute

- Final inference: median 417.8 ms, p90 2055.4 ms
- End of chunk audio → final emitted: median 0.42 s, p90 2.06 s
- Inference time: finals 70.5 s, partials 321.4 s (323 passes, 82.0% of all inference); realtime factor 0.653

## Scripture detection

Expected references: 11 (from reference parser over auto captions). Found 4 → recall 36.4%. 886 distinct suggestions (886.0 per 10 min), precision 0.5% (top-1 only: 2.2%). Spoken → suggestion: median 14.321 s, mean 15.348 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 1 / 1 / 100.0% / 1, stage 1: 71 / 0 / 0.0% / 0, stage 2: 441 / 3 / 0.7% / 3, stage 4: 373 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 3918.8 | Mark 16:16 | weak | — | — | — |
| 4022.5 | Joshua 5:7 | carry | 4051.8 | 29.26 s | 2 |
| 4064.0 | Joshua 5:7 | explicit | — | — | — |
| 4089.0 | Joshua 5:8 | carry | — | — | — |
| 4112.6 | Joshua 5:9 | carry | — | — | — |
| 4140.5 | Joshua 5:10 | carry | — | — | — |
| 4198.5 | Joshua 5:9 | carry | — | — | — |
| 4278.4 | Romans 2:28 | explicit | 4288.58 | 10.18 s | 2 |
| 4292.8 | Romans 2:29 | carry | 4296.28 | 3.49 s | 0 |
| 4359.2 | Deuteronomy 13:8 | carry | — | — | — |
| 4473.5 | Colossians 2:11 | carry | 4491.92 | 18.46 s | 2 |
