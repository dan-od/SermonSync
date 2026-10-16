# Live-feed run: ABC-style-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.prompt_mode": "style"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.4497 (uploaded captions) | 0.6667 | 93.7% | 60.2 s | 0.0 | 1.1% / 68.4% (n=19) | 4.976 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.4497 (S 373, D 179, I 137; 1532 ref words, 1490 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.6667 over 102 words
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

89 chunks, median 6.22 s, mean 6.43 s. Cut/drop reasons: ceiling 66, pause 23

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 6 | 9 | 1 | 3 | 3 | 46 | 8 | 12 | 0 |

## Latency and compute

- Final inference: median 473.5 ms, p90 5326.0 ms
- End of chunk audio → final emitted: median 0.65 s, p90 5.18 s
- Inference time: finals 132.3 s, partials 308.5 s (222 passes, 70.0% of all inference); realtime factor 0.735

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 13 → recall 68.4%. 1192 distinct suggestions (1192.0 per 10 min), precision 1.1% (top-1 only: 7.3%). Spoken → suggestion: median 4.976 s, mean 6.846 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 10 / 4 / 40.0% / 4, stage 2: 637 / 9 / 1.4% / 9, stage 4: 545 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | 1625.96 | 14.82 s | 2 |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1676.7 | 16.75 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1677.54 | 10.83 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1724.64 | 16.33 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1724.64 | 4.98 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1808.62 | 1.89 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1828.86 | 5.5 s | 2 |
| 1861.8 | Revelation 5:12 | explicit | 1866.74 | 4.95 s | 0 |
| 1951.1 | Matthew 13:54 | homophone | 1953.92 | 2.8 s | 0 |
| 2014.1 | John 3:3-5 | explicit | — | — | — |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | 2046.06 | 1.98 s | 0 |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | 2106.48 | 1.32 s | 0 |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2174.36 | -0.14 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2187.32 | 6.99 s | 2 |
