# Live-feed run: E-off-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.partial_mode": "off"}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3027 (auto captions) | 0.5484 | 99.8% | 53.6 s | 2.0 | 0.5% / 60.0% (n=5) | 4.581 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3027 (S 176, D 34, I 47; 849 ref words, 862 hyp words; window [60.0, 660.0])
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
| reached Whisper incl. pre-roll (s) | 384.4 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

2 finals (2.0 per 10 min, 6 words) were emitted where captions show no speech; 0 during music.

- 439.4s “Three, one, two, one.” (chunk 3.92 s, no_speech 0.1269, logprob -0.8774)
- 587.2s “Let's go!” (chunk 1.82 s, no_speech 0.1698, logprob -1.2655)

## Chunks sent to Whisper

121 chunks, median 2.98 s, mean 3.22 s. Cut/drop reasons: ceiling 14, pause 107

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 32 | 24 | 22 | 19 | 5 | 14 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 349.8 ms, p90 450.6 ms
- End of chunk audio → final emitted: median 0.92 s, p90 1.04 s
- Inference time: finals 52.8 s, partials 0.0 s (0 passes, 0.0% of all inference); realtime factor 0.088

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 3 → recall 60.0%. 1002 distinct suggestions (1002.0 per 10 min), precision 0.5% (top-1 only: 2.6%). Spoken → suggestion: median 4.581 s, mean 4.942 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 3 / 3 / 100.0% / 2, stage 2: 532 / 1 / 0.2% / 1, stage 4: 467 / 1 / 0.2% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 101.54 | 3.68 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | 611.74 | 4.58 s | 0 |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 655.0 | 6.57 s | 2 |
