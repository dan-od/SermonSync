# Live-feed run: fixA-hang150-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: fix/vad-sample-rate @ 3c9212a
- Overrides: `{"vad.hangover_ms": 150}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3708 (uploaded captions) | 0.7745 | 91.0% | 55.9 s | 1.0 | 1.0% / 57.9% (n=19) | 8.127 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3708 (S 397, D 46, I 125; 1532 ref words, 1611 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.7745 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 91.0 |
| … covered by VAD alone (%) | 82.6 |
| … passed VAD + worship gate (%) | 82.6 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 55.9 |
| false-open per 10 min (s) | 55.85 |
| VAD open (s) | 493.7 |
| forwarded (s) | 493.7 |
| reached Whisper incl. pre-roll (s) | 543.4 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

1 finals (1.0 per 10 min, 3 words) were emitted where captions show no speech; 0 during music.

- 1602.4s “in my life.” (chunk 1.0 s, no_speech 0.3732, logprob -0.5761)

## Chunks sent to Whisper

104 chunks, median 6.08 s, mean 5.34 s. Cut/drop reasons: ceiling 59, pause 45

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 14 | 10 | 3 | 8 | 9 | 53 | 3 | 3 | 0 |

## Latency and compute

- Final inference: median 441.25 ms, p90 801.1 ms
- End of chunk audio → final emitted: median 0.82 s, p90 1.4 s
- Inference time: finals 75.6 s, partials 270.2 s (324 passes, 78.1% of all inference); realtime factor 0.576

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 11 → recall 57.9%. 1124 distinct suggestions (1124.0 per 10 min), precision 1.0% (top-1 only: 5.0%). Spoken → suggestion: median 8.127 s, mean 7.709 s. By stage (suggestions / matched / precision / expected refs found first): stage 1: 3 / 1 / 33.3% / 1, stage 2: 599 / 9 / 1.5% / 9, stage 4: 522 / 1 / 0.2% / 1.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | 1621.76 | 10.62 s | 2 |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1674.84 | 14.89 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1674.84 | 8.13 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1719.8 | 11.49 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1719.82 | 0.16 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1810.82 | 4.09 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1827.56 | 4.2 s | 4 |
| 1861.8 | Revelation 5:12 | explicit | 1866.02 | 4.23 s | 1 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2029.64 | 15.54 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2176.68 | 2.18 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2189.6 | 9.27 s | 2 |
