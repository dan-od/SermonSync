# Live-feed run: ABC-tail-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.prompt_mode": "final_tail"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.4099 (uploaded captions) | 0.5686 | 93.2% | 60.2 s | 0.0 | 0.8% / 63.2% (n=19) | 8.839 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.4099 (S 399, D 87, I 142; 1532 ref words, 1587 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.5686 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 93.2 |
| … covered by VAD alone (%) | 87.6 |
| … passed VAD + worship gate (%) | 87.6 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 60.2 |
| false-open per 10 min (s) | 60.15 |
| VAD open (s) | 523.4 |
| forwarded (s) | 523.4 |
| reached Whisper incl. pre-roll (s) | 555.8 |
| stale-dropped (s) | 0 |
| trimmed (s) | 3.8 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

83 chunks, median 6.46 s, mean 6.85 s. Cut/drop reasons: ceiling 57, pause 26, trim 190

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 7 | 5 | 4 | 1 | 5 | 30 | 9 | 15 | 3 |

## Latency and compute

- Final inference: median 500.05 ms, p90 1339.6 ms
- End of chunk audio → final emitted: median 0.7 s, p90 1.78 s
- Inference time: finals 88.1 s, partials 330.2 s (229 passes, 78.9% of all inference); realtime factor 0.697

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 12 → recall 63.2%. 1420 distinct suggestions (1420.0 per 10 min), precision 0.8% (top-1 only: 5.0%). Spoken → suggestion: median 8.839 s, mean 8.833 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 7 / 3 / 42.9% / 3, stage 1: 1 / 0 / 0.0% / 0, stage 2: 761 / 8 / 1.1% / 9, stage 4: 651 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | — | — | — |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1672.9 | 12.95 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1673.64 | 6.93 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1724.42 | 16.11 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1724.42 | 4.76 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | 1826.76 | 20.03 s | 2 |
| 1823.4 | Ephesians 1:21 | explicit | 1837.88 | 14.52 s | 2 |
| 1861.8 | Revelation 5:12 | explicit | 1864.38 | 2.59 s | 0 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2025.04 | 10.94 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | 2045.16 | 1.08 s | 0 |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | 2108.0 | 2.84 s | 0 |
| 2139.1 | John 15:4 | explicit | 2149.82 | 10.75 s | 2 |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2177.0 | 2.5 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | — | — | — |
