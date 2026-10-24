# Live-feed run: fixA-hang500-explicit_refs

- Source: Special Christmas Service - Dec. 25, 2021. Living Faith Church, King Jesus — https://www.youtube.com/watch?v=i9jrxRIAq1Q
- Window: 1590–2190 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: uploaded
- Git: fix/vad-sample-rate @ 3c9212a
- Overrides: `{"vad.hangover_ms": 500}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3779 (uploaded captions) | 0.6569 | 96.2% | 63.3 s | 0.0 | 0.8% / 52.6% (n=19) | 7.74 s |

## WER

- **uploaded captions** — agreement with uploaded captions of unverified origin (may be machine-made): WER 0.3779 (S 389, D 65, I 125; 1532 ref words, 1592 hyp words; window [1590.0, 2190.0])
- **Reference spans** (book names + numbers around 19 spoken references): WER 0.6569 over 102 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 448.5 |
| VAD recall: caption speech that reached Whisper (%) | 96.2 |
| … covered by VAD alone (%) | 92.1 |
| … passed VAD + worship gate (%) | 92.1 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 63.3 |
| false-open per 10 min (s) | 63.34 |
| VAD open (s) | 550.0 |
| forwarded (s) | 550.0 |
| reached Whisper incl. pre-roll (s) | 575.1 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

94 chunks, median 6.32 s, mean 6.18 s. Cut/drop reasons: ceiling 78, pause 16

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 4 | 7 | 2 | 1 | 72 | 3 | 3 | 0 |

## Latency and compute

- Final inference: median 424.8 ms, p90 832.1 ms
- End of chunk audio → final emitted: median 0.46 s, p90 1.42 s
- Inference time: finals 67.4 s, partials 274.0 s (349 passes, 80.2% of all inference); realtime factor 0.569

## Scripture detection

Expected references: 19 (from reference parser over uploaded captions). Found 10 → recall 52.6%. 1175 distinct suggestions (1175.0 per 10 min), precision 0.8% (top-1 only: 4.1%). Spoken → suggestion: median 7.74 s, mean 6.284 s. By stage (suggestions / matched / precision / expected refs found first): stage 1: 3 / 1 / 33.3% / 1, stage 2: 625 / 8 / 1.3% / 9, stage 4: 547 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 1611.1 | 1 Peter 2:24 | explicit | 1621.4 | 10.26 s | 2 |
| 1659.9 | Jeremiah 8:20-22 | collapsed | 1668.16 | 8.21 s | 2 |
| 1666.7 | Jeremiah 8:22 | carry | 1673.98 | 7.27 s | 2 |
| 1708.3 | Ephesians 2:5-6 | explicit | 1718.22 | 9.91 s | 2 |
| 1719.7 | Ephesians 2:6 | explicit | 1718.22 | -1.44 s | 2 |
| 1806.7 | Ephesians 2:6 | explicit | — | — | — |
| 1823.4 | Ephesians 1:21 | explicit | 1822.7 | -0.66 s | 2 |
| 1861.8 | Revelation 5:12 | explicit | 1864.88 | 3.09 s | 1 |
| 1951.1 | Matthew 13:54 | homophone | — | — | — |
| 2014.1 | John 3:3-5 | explicit | 2031.34 | 17.24 s | 2 |
| 2030.9 | John 3:5 | carry | — | — | — |
| 2041.1 | Luke 24:31 | explicit | — | — | — |
| 2044.1 | 2 Corinthians 4:4 | explicit | — | — | — |
| 2051.0 | Ephesians 1:17 | collapsed | — | — | — |
| 2105.2 | Job 32:8 | weak | — | — | — |
| 2139.1 | John 15:4 | explicit | — | — | — |
| 2153.1 | Isaiah 37:3 | collapsed | — | — | — |
| 2174.5 | Romans 8:6 | explicit | 2174.66 | 0.16 s | 2 |
| 2180.3 | 1 Corinthians 2:14 | collapsed | 2189.14 | 8.81 s | 2 |
