# Live-feed run: fixA-legacyresample-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a
- Overrides: `{"capture.resampler": "legacy"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3157 (auto captions) | 0.5806 | 99.8% | 53.2 s | 4.0 | 0.1% / 20.0% (n=5) | 12.657 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3157 (S 181, D 36, I 51; 849 ref words, 864 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.5806 over 31 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 267.6 |
| VAD recall: caption speech that reached Whisper (%) | 99.8 |
| … covered by VAD alone (%) | 93.3 |
| … passed VAD + worship gate (%) | 93.3 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 53.2 |
| false-open per 10 min (s) | 53.19 |
| VAD open (s) | 339.5 |
| forwarded (s) | 339.5 |
| reached Whisper incl. pre-roll (s) | 383.7 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

4 finals (4.0 per 10 min, 9 words) were emitted where captions show no speech; 0 during music.

- 210.5s “Three” (chunk 0.88 s, no_speech 0.2817, logprob -0.7251)
- 253.5s “Why?” (chunk 1.02 s, no_speech 0.0999, logprob -0.4303)
- 544.3s “Ha, ha, ha.” (chunk 0.86 s, no_speech 0.5013, logprob -0.9186)
- 587.2s “What's going on here?” (chunk 1.82 s, no_speech 0.148, logprob -1.2354)

## Chunks sent to Whisper

111 chunks, median 3.04 s, mean 3.5 s. Cut/drop reasons: ceiling 19, pause 92

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 26 | 26 | 18 | 14 | 6 | 17 | 2 | 0 | 0 |

## Latency and compute

- Final inference: median 353.9 ms, p90 489.7 ms
- End of chunk audio → final emitted: median 0.98 s, p90 1.38 s
- Inference time: finals 45.5 s, partials 179.8 s (311 passes, 79.8% of all inference); realtime factor 0.376

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 1 → recall 20.0%. 963 distinct suggestions (963.0 per 10 min), precision 0.1% (top-1 only: 1.0%). Spoken → suggestion: median 12.657 s, mean 12.657 s. By stage (suggestions / matched / precision / expected refs found first): stage 2: 508 / 1 / 0.2% / 1, stage 4: 455 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 110.52 | 12.66 s | 2 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | — | — | — |
