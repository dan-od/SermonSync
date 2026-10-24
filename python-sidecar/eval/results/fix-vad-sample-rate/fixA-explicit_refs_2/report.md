# Live-feed run: fixA-explicit_refs_2

- Source: Monday Bible Study  || 5th October, 2026  || Pastor W F Kumuyi — https://www.youtube.com/watch?v=X-iW1iAhJJI
- Window: 3900–4500 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.5168 (auto captions) | 0.8095 | 100.0% | 93.2 s | 0.0 | 0.7% / 54.5% (n=11) | 11.428 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.5168 (S 316, D 25, I 120; 892 ref words, 987 hyp words; window [3900.0, 4500.0])
- **Reference spans** (book names + numbers around 11 spoken references): WER 0.8095 over 42 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 394.5 |
| VAD recall: caption speech that reached Whisper (%) | 100.0 |
| … covered by VAD alone (%) | 99.3 |
| … passed VAD + worship gate (%) | 99.3 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 93.2 |
| false-open per 10 min (s) | 93.17 |
| VAD open (s) | 574.1 |
| forwarded (s) | 574.1 |
| reached Whisper incl. pre-roll (s) | 593.6 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

93 chunks, median 6.44 s, mean 6.6 s. Cut/drop reasons: ceiling 90, pause 3

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 1 | 1 | 1 | 86 | 4 | 0 | 0 |

## Latency and compute

- Final inference: median 386.0 ms, p90 1858.7 ms
- End of chunk audio → final emitted: median 0.4 s, p90 1.94 s
- Inference time: finals 76.2 s, partials 274.1 s (364 passes, 78.2% of all inference); realtime factor 0.584

## Scripture detection

Expected references: 11 (from reference parser over auto captions). Found 6 → recall 54.5%. 870 distinct suggestions (870.0 per 10 min), precision 0.7% (top-1 only: 2.4%). Spoken → suggestion: median 11.428 s, mean 11.111 s. By stage (suggestions / matched / precision / expected refs found first): stage 1: 75 / 0 / 0.0% / 0, stage 2: 442 / 6 / 1.4% / 6, stage 4: 353 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 3918.8 | Mark 16:16 | weak | 3914.38 | -4.44 s | 2 |
| 4022.5 | Joshua 5:7 | carry | — | — | — |
| 4064.0 | Joshua 5:7 | explicit | 4084.8 | 20.78 s | 2 |
| 4089.0 | Joshua 5:8 | carry | — | — | — |
| 4112.6 | Joshua 5:9 | carry | 4126.12 | 13.48 s | 2 |
| 4140.5 | Joshua 5:10 | carry | 4164.68 | 24.18 s | 2 |
| 4198.5 | Joshua 5:9 | carry | — | — | — |
| 4278.4 | Romans 2:28 | explicit | 4281.68 | 3.28 s | 2 |
| 4292.8 | Romans 2:29 | carry | 4302.16 | 9.37 s | 2 |
| 4359.2 | Deuteronomy 13:8 | carry | — | — | — |
| 4473.5 | Colossians 2:11 | carry | — | — | — |
