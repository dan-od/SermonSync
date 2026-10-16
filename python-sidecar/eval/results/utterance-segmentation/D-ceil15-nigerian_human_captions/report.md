# Live-feed run: D-ceil15-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.max_chunk_seconds": 15}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2886 (auto captions) | 0.5484 | 99.8% | 53.6 s | 1.0 | 0.2% / 40.0% (n=5) | 7.869 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2886 (S 155, D 44, I 46; 849 ref words, 851 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.5484 over 31 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 267.6 |
| VAD recall: caption speech that reached Whisper (%) | 99.8 |
| … covered by VAD alone (%) | 93.3 |
| … passed VAD + worship gate (%) | 93.3 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 53.6 |
| false-open per 10 min (s) | 53.59 |
| VAD open (s) | 340.0 |
| forwarded (s) | 340.0 |
| reached Whisper incl. pre-roll (s) | 384.1 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0.2 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

1 finals (1.0 per 10 min, 4 words) were emitted where captions show no speech; 0 during music.

- 587.2s “I'm going to eat” (chunk 1.82 s, no_speech 0.1698, logprob -1.3151)

## Chunks sent to Whisper

97 chunks, median 3.06 s, mean 4.02 s. Cut/drop reasons: ceiling 2, pause 95, trim 12

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 26 | 19 | 16 | 12 | 3 | 6 | 9 | 2 | 2 |

## Latency and compute

- Final inference: median 354.0 ms, p90 534.1 ms
- End of chunk audio → final emitted: median 1.02 s, p90 1.42 s
- Inference time: finals 41.3 s, partials 175.4 s (323 passes, 80.9% of all inference); realtime factor 0.361

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 826 distinct suggestions (826.0 per 10 min), precision 0.2% (top-1 only: 2.2%). Spoken → suggestion: median 7.869 s, mean 7.869 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 3 / 2 / 66.7% / 2, stage 1: 1 / 0 / 0.0% / 0, stage 2: 441 / 0 / 0.0% / 0, stage 4: 381 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 106.16 | 8.3 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | 614.6 | 7.44 s | 0 |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | — | — | — |
