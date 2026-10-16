# Live-feed run: fixA-repeat-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3251 (auto captions) | 0.4839 | 99.8% | 53.6 s | 4.0 | 0.2% / 40.0% (n=5) | 11.323 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3251 (S 191, D 29, I 56; 849 ref words, 876 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.4839 over 31 words
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

4 finals (4.0 per 10 min, 7 words) were emitted where captions show no speech; 0 during music.

- 210.5s “Three” (chunk 0.88 s, no_speech 0.2501, logprob -0.6509)
- 253.5s “Why?” (chunk 1.06 s, no_speech 0.1173, logprob -0.4182)
- 543.6s “haha” (chunk 0.66 s, no_speech 0.5215, logprob -0.7957)
- 587.3s “I'm going to eat” (chunk 1.82 s, no_speech 0.1698, logprob -1.3151)

## Chunks sent to Whisper

111 chunks, median 3.08 s, mean 3.51 s. Cut/drop reasons: ceiling 19, pause 92

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 28 | 23 | 20 | 13 | 6 | 17 | 2 | 0 | 0 |

## Latency and compute

- Final inference: median 349.2 ms, p90 506.6 ms
- End of chunk audio → final emitted: median 0.96 s, p90 1.38 s
- Inference time: finals 66.6 s, partials 157.5 s (303 passes, 70.3% of all inference); realtime factor 0.374

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 884 distinct suggestions (884.0 per 10 min), precision 0.2% (top-1 only: 1.1%). Spoken → suggestion: median 11.323 s, mean 11.323 s. By stage (suggestions / matched / precision / expected refs found first): stage 2: 465 / 2 / 0.4% / 2, stage 4: 419 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 110.92 | 13.06 s | 2 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 658.02 | 9.59 s | 2 |
