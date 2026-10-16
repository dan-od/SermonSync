# Live-feed run: ABC-hot-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0
- Overrides: `{"streaming.prompt_mode": "style", "streaming.prompt_as_hotwords": true}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3216 (auto captions) | 0.5806 | 99.8% | 53.6 s | 0.0 | 0.3% / 40.0% (n=5) | 4.299 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3216 (S 175, D 53, I 45; 849 ref words, 841 hyp words; window [60.0, 660.0])
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

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

108 chunks, median 3.26 s, mean 3.61 s. Cut/drop reasons: ceiling 16, pause 92

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 26 | 21 | 22 | 12 | 9 | 13 | 2 | 1 | 0 |

## Latency and compute

- Final inference: median 354.2 ms, p90 507.1 ms
- End of chunk audio → final emitted: median 0.94 s, p90 1.86 s
- Inference time: finals 66.6 s, partials 206.4 s (267 passes, 75.6% of all inference); realtime factor 0.455

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 930 distinct suggestions (930.0 per 10 min), precision 0.3% (top-1 only: 1.9%). Spoken → suggestion: median 4.299 s, mean 4.299 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 2 / 2 / 100.0% / 2, stage 2: 493 / 1 / 0.2% / 0, stage 4: 435 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 101.46 | 3.6 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | 612.16 | 5.0 s | 0 |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | — | — | — |
