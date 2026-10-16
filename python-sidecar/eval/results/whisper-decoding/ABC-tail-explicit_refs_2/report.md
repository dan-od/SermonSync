# Live-feed run: ABC-tail-explicit_refs_2

- Source: Monday Bible Study  || 5th October, 2026  || Pastor W F Kumuyi — https://www.youtube.com/watch?v=X-iW1iAhJJI
- Window: 3900–4500 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.prompt_mode": "final_tail"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.9484 (auto captions) | 0.6429 | 96.2% | 93.2 s | 0.0 | 0.7% / 45.5% (n=11) | 4.611 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.9484 (S 341, D 86, I 419; 892 ref words, 1225 hyp words; window [3900.0, 4500.0])
- **Reference spans** (book names + numbers around 11 spoken references): WER 0.6429 over 42 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 394.5 |
| VAD recall: caption speech that reached Whisper (%) | 96.2 |
| … covered by VAD alone (%) | 99.3 |
| … passed VAD + worship gate (%) | 99.3 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 93.2 |
| false-open per 10 min (s) | 93.17 |
| VAD open (s) | 574.1 |
| forwarded (s) | 574.1 |
| reached Whisper incl. pre-roll (s) | 571.4 |
| stale-dropped (s) | 0 |
| trimmed (s) | 22.2 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

68 chunks, median 6.95 s, mean 8.7 s. Cut/drop reasons: ceiling 67, pause 1, trim 1134

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 1 | 0 | 40 | 8 | 10 | 9 |

## Latency and compute

- Final inference: median 458.4 ms, p90 10460.2 ms
- End of chunk audio → final emitted: median 0.48 s, p90 10.46 s
- Inference time: finals 168.9 s, partials 303.7 s (183 passes, 64.3% of all inference); realtime factor 0.788

## Scripture detection

Expected references: 11 (from reference parser over auto captions). Found 5 → recall 45.5%. 720 distinct suggestions (720.0 per 10 min), precision 0.7% (top-1 only: 4.1%). Spoken → suggestion: median 4.611 s, mean 4.668 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 4 / 3 / 75.0% / 3, stage 1: 70 / 0 / 0.0% / 0, stage 2: 340 / 2 / 0.6% / 2, stage 4: 306 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 3918.8 | Mark 16:16 | weak | — | — | — |
| 4022.5 | Joshua 5:7 | carry | — | — | — |
| 4064.0 | Joshua 5:7 | explicit | 4063.68 | -0.34 s | 2 |
| 4089.0 | Joshua 5:8 | carry | — | — | — |
| 4112.6 | Joshua 5:9 | carry | 4121.86 | 9.22 s | 2 |
| 4140.5 | Joshua 5:10 | carry | — | — | — |
| 4198.5 | Joshua 5:9 | carry | — | — | — |
| 4278.4 | Romans 2:28 | explicit | 4275.34 | -3.06 s | 0 |
| 4292.8 | Romans 2:29 | carry | 4297.4 | 4.61 s | 0 |
| 4359.2 | Deuteronomy 13:8 | carry | — | — | — |
| 4473.5 | Colossians 2:11 | carry | 4486.36 | 12.9 s | 0 |
