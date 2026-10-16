# Live-feed run: D-ceil15-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.max_chunk_seconds": 15}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3303 (uploaded captions) | 0.6373 | 92.9% | 60.2 s | 0.0 | 0.8% / 52.6% (n=19) | 10.782 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3303 (S 338, D 57, I 111; 1532 ref words, 1586 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.6373 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 92.9 |
| … covered by VAD alone (%) | 87.6 |
| … passed VAD + worship gate (%) | 87.6 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 60.2 |
| false-open per 10 min (s) | 60.15 |
| VAD open (s) | 523.4 |
| forwarded (s) | 523.4 |
| reached Whisper incl. pre-roll (s) | 550.0 |
| stale-dropped (s) | 0 |
| trimmed (s) | 9.7 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

56 chunks, median 11.79 s, mean 10.05 s. Cut/drop reasons: ceiling 19, pause 37, trim 483

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 4 | 4 | 1 | 3 | 3 | 7 | 3 | 12 | 19 |

## Latency and compute

- Final inference: median 543.75 ms, p90 851.4 ms
- End of chunk audio → final emitted: median 1.02 s, p90 1.54 s
- Inference time: finals 40.0 s, partials 275.7 s (404 passes, 87.3% of all inference); realtime factor 0.526

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 10 → recall 52.6%. 1161 distinct suggestions (1161.0 per 10 min), precision 0.8% (top-1 only: 7.0%). Spoken → suggestion: median 10.782 s, mean 8.621 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 5 / 4 / 80.0% / 4, stage 1: 1 / 0 / 0.0% / 0, stage 2: 635 / 5 / 0.8% / 6, stage 4: 520 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | — | — | — |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1673.42 | 13.47 s | 0 |
| 1666.7 | Jeremiah 8:22 | carry | 1673.46 | 6.75 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1721.74 | 13.43 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1721.74 | 2.08 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1818.16 | 11.43 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | — | — | — |
| 1861.8 | Revelation 5:12 | explicit | 1872.4 | 10.61 s | 0 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | — | — | — |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | 2043.16 | 2.03 s | 0 |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | 2116.12 | 10.96 s | 0 |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2178.8 | 4.3 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2191.484 | 11.15 s | 2 |
