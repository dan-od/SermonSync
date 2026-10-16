# Live-feed run: D-sf0.6-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.silence_flush_seconds": 0.6}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3962 (uploaded captions) | 0.5392 | 93.5% | 60.2 s | 0.0 | 1.1% / 63.2% (n=19) | 2.46 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3962 (S 417, D 77, I 113; 1532 ref words, 1568 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.5392 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 93.5 |
| … covered by VAD alone (%) | 87.6 |
| … passed VAD + worship gate (%) | 87.6 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 60.2 |
| false-open per 10 min (s) | 60.15 |
| VAD open (s) | 523.4 |
| forwarded (s) | 523.4 |
| reached Whisper incl. pre-roll (s) | 557.6 |
| stale-dropped (s) | 0 |
| trimmed (s) | 2.0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

100 chunks, median 6.19 s, mean 5.71 s. Cut/drop reasons: ceiling 75, pause 25, trim 100

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 9 | 7 | 2 | 2 | 3 | 69 | 5 | 0 | 1 |

## Latency and compute

- Final inference: median 430.9 ms, p90 1304.6 ms
- End of chunk audio → final emitted: median 0.47 s, p90 1.64 s
- Inference time: finals 71.5 s, partials 259.5 s (358 passes, 78.4% of all inference); realtime factor 0.552

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 12 → recall 63.2%. 1131 distinct suggestions (1131.0 per 10 min), precision 1.1% (top-1 only: 6.8%). Spoken → suggestion: median 2.46 s, mean 2.977 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 5 / 3 / 60.0% / 3, stage 1: 1 / 0 / 0.0% / 0, stage 2: 608 / 8 / 1.3% / 8, stage 4: 517 / 1 / 0.2% / 1.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | 1616.2 | 5.06 s | 2 |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1662.92 | 2.97 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1671.44 | 4.73 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1711.92 | 3.61 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1718.16 | -1.5 s | 4 |
| 1806.7 | Ephesians 2:6 | explicit | — | — | — |
| 1823.4 | Ephesians 1:21 | explicit | 1819.34 | -4.02 s | 2 |
| 1861.8 | Revelation 5:12 | explicit | 1863.74 | 1.95 s | 0 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2031.74 | 17.64 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | 2043.72 | -0.36 s | 0 |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | 2108.92 | 3.76 s | 0 |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2175.1 | 0.6 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2181.62 | 1.29 s | 2 |
