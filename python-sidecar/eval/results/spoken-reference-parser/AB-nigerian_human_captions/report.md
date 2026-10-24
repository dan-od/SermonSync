# Live-feed run: AB-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.hallucination_filter": false}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3486 (auto captions) | 0.6452 | 99.8% | 53.6 s | 4.0 | 0.1% / 20.0% (n=5) | 5.537 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3486 (S 179, D 46, I 71; 849 ref words, 874 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.6452 over 31 words
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
| reached Whisper incl. pre-roll (s) | 384.0 |
| stale-dropped (s) | 0.3 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

4 finals (4.0 per 10 min, 7 words) were emitted where captions show no speech; 0 during music.

- 210.4s “Three” (chunk 0.88 s, no_speech 0.2501, logprob -0.6509)
- 253.5s “Why?” (chunk 1.06 s, no_speech 0.1173, logprob -0.4182)
- 543.9s “haha” (chunk 0.66 s, no_speech 0.5215, logprob -0.7957)
- 587.4s “I'm going to eat” (chunk 1.82 s, no_speech 0.1698, logprob -1.3151)

## Chunks sent to Whisper

114 chunks, median 3.03 s, mean 3.42 s. Cut/drop reasons: ceiling 14, pause 100, stale_drop 1

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 25 | 28 | 18 | 18 | 8 | 13 | 1 | 0 | 0 |

## Latency and compute

- Final inference: median 348.65 ms, p90 443.6 ms
- End of chunk audio → final emitted: median 0.98 s, p90 1.54 s
- Inference time: finals 58.0 s, partials 152.0 s (318 passes, 72.4% of all inference); realtime factor 0.35

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 1 → recall 20.0%. 899 distinct suggestions (899.0 per 10 min), precision 0.1% (top-1 only: 1.0%). Spoken → suggestion: median 5.537 s, mean 5.537 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 2 / 1 / 50.0% / 1, stage 2: 469 / 0 / 0.0% / 0, stage 4: 428 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 103.4 | 5.54 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | — | — | — |
