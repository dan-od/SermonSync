# Live-feed run: fixB-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: feat/spoken-reference-parser @ 493f3fb

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.9883 (uploaded captions) | 1.0 | 1.6% | 0.6 s | 0.0 | 0.0% / 0.0% (n=19) | — |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.9883 (S 19, D 1495, I 0; 1532 ref words, 37 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 1.0 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 1.6 |
| … covered by VAD alone (%) | 1.4 |
| … passed VAD + worship gate (%) | 1.4 |
| caption speech lost to stale-drop (s) | 0.2 |
| VAD false-open: forwarded with no caption speech (s) | 0.6 |
| false-open per 10 min (s) | 0.59 |
| VAD open (s) | 7.6 |
| forwarded (s) | 7.6 |
| reached Whisper incl. pre-roll (s) | 8.6 |
| stale-dropped (s) | 1.0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

7 chunks, median 0.92 s, mean 1.26 s. Cut/drop reasons: pause 7, stale_drop 3

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 657.6 ms, p90 3985.9 ms
- End of chunk audio → final emitted: median 1.38 s, p90 9.04 s
- Inference time: finals 8.3 s, partials 10.4 s (5 passes, 55.6% of all inference); realtime factor 0.031

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 0 → recall 0.0%. 38 distinct suggestions (38.0 per 10 min), precision 0.0% (top-1 only: 0.0%). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): stage 2: 14 / 0 / 0.0% / 0, stage 4: 24 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | — | — | — |
| 1659.9 | Jeremiah 8:20-22 | collapsed | — | — | — |
| 1666.7 | Jeremiah 8:22 | carry | — | — | — |
| 1708.3 | Ephesians 2:5-6 | explicit | — | — | — |
| 1719.7 | Ephesians 2:6 | explicit | — | — | — |
| 1806.7 | Ephesians 2:6 | explicit | — | — | — |
| 1823.4 | Ephesians 1:21 | explicit | — | — | — |
| 1861.8 | Revelation 5:12 | explicit | — | — | — |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | — | — | — |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | — | — | — |
| 2180.3 | 1 Corinthians 2:14 | collapsed | — | — | — |
