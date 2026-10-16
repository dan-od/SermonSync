# Live-feed run: ABC-hot-explicit_refs_2

- Source: Monday Bible Study  || 5th October, 2026  || Pastor W F Kumuyi — https://www.youtube.com/watch?v=X-iW1iAhJJI
- Window: 3900–4500 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.prompt_mode": "style", "streaming.prompt_as_hotwords": true}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.5112 (auto captions) | 0.619 | 100.0% | 93.2 s | 0.0 | 0.5% / 45.5% (n=11) | 4.62 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.5112 (S 306, D 33, I 117; 892 ref words, 976 hyp words; window [3900.0, 4500.0])
- **Reference spans** (book names + numbers around 11 spoken references): WER 0.619 over 42 words
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
| reached Whisper incl. pre-roll (s) | 593.5 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0.1 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

83 chunks, median 6.74 s, mean 7.4 s. Cut/drop reasons: ceiling 81, pause 2, trim 5

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 2 | 0 | 60 | 14 | 6 | 1 |

## Latency and compute

- Final inference: median 458.5 ms, p90 3392.7 ms
- End of chunk audio → final emitted: median 0.46 s, p90 3.4 s
- Inference time: finals 117.8 s, partials 339.4 s (227 passes, 74.2% of all inference); realtime factor 0.762

## Scripture detection

Expected references: 11 (from reference parser over auto captions). Found 5 → recall 45.5%. 951 distinct suggestions (951.0 per 10 min), precision 0.5% (top-1 only: 4.9%). Spoken → suggestion: median 4.62 s, mean 7.576 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 5 / 3 / 60.0% / 3, stage 1: 76 / 0 / 0.0% / 0, stage 2: 482 / 2 / 0.4% / 2, stage 4: 388 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 3918.8 | Mark 16:16 | weak | — | — | — |
| 4022.5 | Joshua 5:7 | carry | 4025.38 | 2.84 s | 0 |
| 4064.0 | Joshua 5:7 | explicit | 4085.64 | 21.62 s | 2 |
| 4089.0 | Joshua 5:8 | carry | — | — | — |
| 4112.6 | Joshua 5:9 | carry | 4118.14 | 5.51 s | 0 |
| 4140.5 | Joshua 5:10 | carry | — | — | — |
| 4198.5 | Joshua 5:9 | carry | — | — | — |
| 4278.4 | Romans 2:28 | explicit | 4283.02 | 4.62 s | 2 |
| 4292.8 | Romans 2:29 | carry | 4296.08 | 3.29 s | 0 |
| 4359.2 | Deuteronomy 13:8 | carry | — | — | — |
| 4473.5 | Colossians 2:11 | carry | — | — | — |
