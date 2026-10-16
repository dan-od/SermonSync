# Live-feed run: D-sf0.8-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.silence_flush_seconds": 0.8}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3675 (uploaded captions) | 0.5686 | 93.7% | 60.2 s | 0.0 | 0.9% / 57.9% (n=19) | 3.687 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3675 (S 383, D 61, I 119; 1532 ref words, 1590 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.5686 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 93.7 |
| … covered by VAD alone (%) | 87.6 |
| … passed VAD + worship gate (%) | 87.6 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 60.2 |
| false-open per 10 min (s) | 60.15 |
| VAD open (s) | 523.4 |
| forwarded (s) | 523.4 |
| reached Whisper incl. pre-roll (s) | 559.6 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

94 chunks, median 6.24 s, mean 6.09 s. Cut/drop reasons: ceiling 79, pause 15

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 5 | 3 | 0 | 4 | 1 | 72 | 5 | 2 | 0 |

## Latency and compute

- Final inference: median 427.8 ms, p90 686.5 ms
- End of chunk audio → final emitted: median 0.46 s, p90 1.56 s
- Inference time: finals 61.3 s, partials 250.7 s (378 passes, 80.4% of all inference); realtime factor 0.52

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 11 → recall 57.9%. 1334 distinct suggestions (1334.0 per 10 min), precision 0.9% (top-1 only: 6.7%). Spoken → suggestion: median 3.687 s, mean 4.84 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 5 / 1 / 20.0% / 1, stage 1: 2 / 1 / 50.0% / 1, stage 2: 700 / 9 / 1.3% / 8, stage 4: 627 / 1 / 0.2% / 1.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | — | — | — |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1662.78 | 2.83 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1670.4 | 3.69 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1711.8 | 3.49 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1724.62 | 4.96 s | 4 |
| 1806.7 | Ephesians 2:6 | explicit | 1811.82 | 5.09 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1836.08 | 12.72 s | 1 |
| 1861.8 | Revelation 5:12 | explicit | 1862.6 | 0.81 s | 0 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2028.32 | 14.22 s | 2 |
| 2030.9 | John 3:5 | carry | 2028.32 | -2.56 s | 2 |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2174.34 | -0.16 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2188.48 | 8.15 s | 2 |
