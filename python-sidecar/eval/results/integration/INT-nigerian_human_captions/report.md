# Live-feed run: INT-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: feat/stt-pipeline-fixes @ 9857060

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2839 (auto captions) | 0.6452 | 99.8% | 53.6 s | 2.0 | 0.5% / 60.0% (n=5) | 7.497 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2839 (S 155, D 48, I 38; 849 ref words, 839 hyp words; window [60.0, 660.0])
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
| reached Whisper incl. pre-roll (s) | 384.4 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

2 finals (2.0 per 10 min, 3 words) were emitted where captions show no speech; 0 during music.

- 249.0s “Quiet.” (chunk 2.48 s, no_speech 0.4356, logprob -0.6608)
- 249.0s “Until you” (chunk 2.48 s, no_speech 0.4356, logprob -0.6608)

## Chunks sent to Whisper

97 chunks, median 3.68 s, mean 4.02 s. Cut/drop reasons: ceiling 29, pause 68

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 15 | 16 | 17 | 9 | 7 | 28 | 1 | 0 | 0 |

## Latency and compute

- Final inference: median 374.0 ms, p90 571.2 ms
- End of chunk audio → final emitted: median 1.28 s, p90 1.68 s
- Inference time: finals 40.5 s, partials 178.2 s (332 passes, 81.5% of all inference); realtime factor 0.365

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 3 → recall 60.0%. 881 distinct suggestions (881.0 per 10 min), precision 0.5% (top-1 only: 3.3%). Spoken → suggestion: median 7.497 s, mean 8.601 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 2 / 2 / 100.0% / 2, stage 2: 446 / 1 / 0.2% / 1, stage 4: 433 / 1 / 0.2% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 105.36 | 7.5 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | 612.32 | 5.16 s | 0 |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 661.576 | 13.14 s | 2 |
