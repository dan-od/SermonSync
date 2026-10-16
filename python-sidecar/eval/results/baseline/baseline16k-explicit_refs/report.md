# Live-feed run: baseline16k-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: feat/ss-072-live-feed-harness @ b9baf82

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3871 (uploaded captions) | 0.7353 | 87.6% | 56.2 s | 0.0 | 0.9% / 57.9% (n=19) | 7.02 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3871 (S 417, D 45, I 131; 1532 ref words, 1618 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.7353 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 87.6 |
| … covered by VAD alone (%) | 83.3 |
| … passed VAD + worship gate (%) | 83.3 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 56.2 |
| false-open per 10 min (s) | 56.21 |
| VAD open (s) | 497.2 |
| forwarded (s) | 497.2 |
| reached Whisper incl. pre-roll (s) | 523.1 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

104 chunks, median 6.03 s, mean 5.05 s. Cut/drop reasons: ceiling 57, pause 47

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 8 | 11 | 9 | 7 | 6 | 52 | 2 | 3 | 0 |

## Latency and compute

- Final inference: median 419.1 ms, p90 1430.0 ms
- End of chunk audio → final emitted: median 0.87 s, p90 2.08 s
- Inference time: finals 71.5 s, partials 252.7 s (353 passes, 78.0% of all inference); realtime factor 0.54

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 11 → recall 57.9%. 1267 distinct suggestions (1267.0 per 10 min), precision 0.9% (top-1 only: 4.8%). Spoken → suggestion: median 7.02 s, mean 7.945 s. By stage (suggestions / matched / precision / expected refs found first): stage 1: 4 / 2 / 50.0% / 2, stage 2: 641 / 9 / 1.4% / 9, stage 4: 622 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | 1617.08 | 5.94 s | 2 |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1673.68 | 13.73 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1673.68 | 6.97 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1726.72 | 18.41 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1726.72 | 7.06 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1809.48 | 2.75 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1837.94 | 14.58 s | 1 |
| 1861.8 | Revelation 5:12 | explicit | 1863.5 | 1.71 s | 1 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2021.12 | 7.02 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2175.74 | 1.24 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2188.32 | 7.99 s | 2 |
