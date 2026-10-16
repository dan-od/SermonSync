# Live-feed run: E-tiny-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.partial_mode": "tiny.en"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3628 (auto captions) | 0.7742 | 99.8% | 53.6 s | 1.0 | 0.3% / 60.0% (n=5) | 5.041 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3628 (S 188, D 33, I 87; 849 ref words, 903 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.7742 over 31 words
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

- 587.9s “I'm going to eat” (chunk 1.82 s, no_speech 0.1698, logprob -1.3151)

## Chunks sent to Whisper

117 chunks, median 3.06 s, mean 3.33 s. Cut/drop reasons: ceiling 15, pause 102

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 29 | 25 | 24 | 15 | 6 | 15 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 353.2 ms, p90 545.4 ms
- End of chunk audio → final emitted: median 0.94 s, p90 1.54 s
- Inference time: finals 63.6 s, partials 87.7 s (311 passes, 58.0% of all inference); realtime factor 0.252

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 3 → recall 60.0%. 879 distinct suggestions (879.0 per 10 min), precision 0.3% (top-1 only: 3.0%). Spoken → suggestion: median 5.041 s, mean 7.498 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 2 / 2 / 100.0% / 2, stage 2: 460 / 1 / 0.2% / 1, stage 4: 417 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 102.04 | 4.18 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | 612.2 | 5.04 s | 0 |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 661.707 | 13.28 s | 2 |
