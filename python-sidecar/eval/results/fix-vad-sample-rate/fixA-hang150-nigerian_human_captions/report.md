# Live-feed run: fixA-hang150-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a
- Overrides: `{"vad.hangover_ms": 150}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2968 (auto captions) | 0.3548 | 99.5% | 34.5 s | 6.0 | 0.2% / 40.0% (n=5) | 9.643 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2968 (S 160, D 38, I 54; 849 ref words, 865 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.3548 over 31 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 267.6 |
| VAD recall: caption speech that reached Whisper (%) | 99.5 |
| … covered by VAD alone (%) | 91.7 |
| … passed VAD + worship gate (%) | 91.7 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 34.5 |
| false-open per 10 min (s) | 34.5 |
| VAD open (s) | 312.7 |
| forwarded (s) | 312.7 |
| reached Whisper incl. pre-roll (s) | 362.1 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

6 finals (6.0 per 10 min, 14 words) were emitted where captions show no speech; 0 during music.

- 210.3s “Three” (chunk 0.72 s, no_speech 0.263, logprob -0.584)
- 253.4s “Why?” (chunk 0.9 s, no_speech 0.1503, logprob -0.3903)
- 428.8s “Now” (chunk 0.76 s, no_speech 0.1319, logprob -0.5565)
- 439.3s “Three, one, two, one, two, one.” (chunk 3.58 s, no_speech 0.2017, logprob -0.8338)
- 543.9s “haha” (chunk 0.5 s, no_speech 0.4434, logprob -0.9257)
- 587.5s “I'm going to eat” (chunk 1.66 s, no_speech 0.1454, logprob -1.3691)

## Chunks sent to Whisper

121 chunks, median 2.7 s, mean 3.04 s. Cut/drop reasons: ceiling 11, pause 110

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 34 | 29 | 21 | 15 | 6 | 10 | 1 | 0 | 0 |

## Latency and compute

- Final inference: median 352.9 ms, p90 475.2 ms
- End of chunk audio → final emitted: median 0.98 s, p90 1.34 s
- Inference time: finals 49.8 s, partials 167.3 s (292 passes, 77.1% of all inference); realtime factor 0.362

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 968 distinct suggestions (968.0 per 10 min), precision 0.2% (top-1 only: 0.9%). Spoken → suggestion: median 9.643 s, mean 9.643 s. By stage (suggestions / matched / precision / expected refs found first): stage 2: 509 / 2 / 0.4% / 2, stage 4: 459 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 110.54 | 12.68 s | 2 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 655.04 | 6.61 s | 2 |
