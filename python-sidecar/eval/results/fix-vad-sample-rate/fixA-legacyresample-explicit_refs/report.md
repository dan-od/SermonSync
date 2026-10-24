# Live-feed run: fixA-legacyresample-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: fix/vad-sample-rate @ 3c9212a
- Overrides: `{"capture.resampler": "legacy"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3871 (uploaded captions) | 0.5392 | 93.7% | 60.0 s | 0.0 | 0.8% / 52.6% (n=19) | 6.525 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3871 (S 405, D 63, I 125; 1532 ref words, 1594 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.5392 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 93.7 |
| … covered by VAD alone (%) | 87.4 |
| … passed VAD + worship gate (%) | 87.4 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 60.0 |
| false-open per 10 min (s) | 59.98 |
| VAD open (s) | 522.3 |
| forwarded (s) | 522.3 |
| reached Whisper incl. pre-roll (s) | 559.2 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

100 chunks, median 6.12 s, mean 5.72 s. Cut/drop reasons: ceiling 71, pause 29

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 6 | 7 | 3 | 4 | 4 | 61 | 6 | 4 | 0 |

## Latency and compute

- Final inference: median 426.15 ms, p90 1123.9 ms
- End of chunk audio → final emitted: median 0.48 s, p90 1.66 s
- Inference time: finals 70.8 s, partials 261.0 s (347 passes, 78.7% of all inference); realtime factor 0.553

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 10 → recall 52.6%. 1236 distinct suggestions (1236.0 per 10 min), precision 0.8% (top-1 only: 6.6%). Spoken → suggestion: median 6.525 s, mean 8.61 s. By stage (suggestions / matched / precision / expected refs found first): stage 1: 4 / 2 / 50.0% / 2, stage 2: 655 / 8 / 1.2% / 8, stage 4: 577 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | — | — | — |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1671.68 | 11.73 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1671.7 | 4.99 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1723.88 | 15.57 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1723.88 | 4.22 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1810.02 | 3.29 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1837.62 | 14.26 s | 1 |
| 1861.8 | Revelation 5:12 | explicit | 1863.2 | 1.41 s | 1 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2031.68 | 17.58 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2179.86 | 5.36 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2188.02 | 7.69 s | 2 |
