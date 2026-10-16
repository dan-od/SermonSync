# Live-feed run: D-ceil10-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.max_chunk_seconds": 10}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2945 (auto captions) | 0.4194 | 99.8% | 53.6 s | 1.0 | 0.4% / 60.0% (n=5) | 8.417 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2945 (S 163, D 44, I 43; 849 ref words, 848 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.4194 over 31 words
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
| reached Whisper incl. pre-roll (s) | 384.4 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

1 finals (1.0 per 10 min, 4 words) were emitted where captions show no speech; 0 during music.

- 587.3s “I'm going to eat” (chunk 1.82 s, no_speech 0.1698, logprob -1.3151)

## Chunks sent to Whisper

102 chunks, median 2.87 s, mean 3.82 s. Cut/drop reasons: ceiling 5, pause 97

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 29 | 21 | 17 | 11 | 4 | 4 | 9 | 5 | 0 |

## Latency and compute

- Final inference: median 347.95 ms, p90 513.5 ms
- End of chunk audio → final emitted: median 0.97 s, p90 1.42 s
- Inference time: finals 42.1 s, partials 166.0 s (327 passes, 79.8% of all inference); realtime factor 0.347

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 3 → recall 60.0%. 834 distinct suggestions (834.0 per 10 min), precision 0.4% (top-1 only: 3.3%). Spoken → suggestion: median 8.417 s, mean 7.967 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 3 / 2 / 66.7% / 2, stage 1: 1 / 0 / 0.0% / 0, stage 2: 443 / 1 / 0.2% / 1, stage 4: 387 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 106.28 | 8.42 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | 609.74 | 2.58 s | 0 |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 661.335 | 12.9 s | 2 |
