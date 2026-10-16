# Live-feed run: fixA-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: fix/vad-sample-rate @ 59a36ed

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.4047 (uploaded captions) | 0.6471 | 93.7% | 60.2 s | 0.0 | 0.5% / 36.8% (n=19) | 3.833 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.4047 (S 385, D 81, I 154; 1532 ref words, 1605 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.6471 over 102 words
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

99 chunks, median 6.2 s, mean 5.78 s. Cut/drop reasons: ceiling 71, pause 28

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 9 | 7 | 3 | 4 | 4 | 62 | 6 | 3 | 0 |

## Latency and compute

- Final inference: median 429.2 ms, p90 789.3 ms
- End of chunk audio → final emitted: median 0.5 s, p90 1.22 s
- Inference time: finals 59.9 s, partials 285.7 s (334 passes, 82.7% of all inference); realtime factor 0.576

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 7 → recall 36.8%. 1332 distinct suggestions (1332.0 per 10 min), precision 0.5% (top-1 only: 4.9%). Spoken → suggestion: median 3.833 s, mean 7.393 s. By stage (suggestions / matched / precision / expected refs found first): stage 1: 2 / 0 / 0.0% / 0, stage 2: 724 / 7 / 1.0% / 7, stage 4: 606 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | — | — | — |
| 1659.9 | Jeremiah 8:20-22 | collapsed | — | — | — |
| 1666.7 | Jeremiah 8:22 | carry | — | — | — |
| 1708.3 | Ephesians 2:5-6 | explicit | 1718.56 | 10.25 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1718.56 | -1.1 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1810.56 | 3.83 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1847.26 | 23.9 s | 2 |
| 1861.8 | Revelation 5:12 | explicit | — | — | — |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2027.54 | 13.44 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2174.38 | -0.12 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2181.88 | 1.55 s | 2 |
