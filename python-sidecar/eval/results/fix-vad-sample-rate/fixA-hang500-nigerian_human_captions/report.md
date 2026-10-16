# Live-feed run: fixA-hang500-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a
- Overrides: `{"vad.hangover_ms": 500}`

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3015 (auto captions) | 0.6129 | 99.8% | 78.0 s | 5.0 | 0.1% / 20.0% (n=5) | 12.797 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3015 (S 166, D 43, I 47; 849 ref words, 853 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.6129 over 31 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 267.6 |
| VAD recall: caption speech that reached Whisper (%) | 99.8 |
| … covered by VAD alone (%) | 94.5 |
| … passed VAD + worship gate (%) | 94.5 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 78.0 |
| false-open per 10 min (s) | 77.95 |
| VAD open (s) | 370.4 |
| forwarded (s) | 370.4 |
| reached Whisper incl. pre-roll (s) | 408.5 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

5 finals (5.0 per 10 min, 10 words) were emitted where captions show no speech; 0 during music.

- 210.7s “Three” (chunk 1.08 s, no_speech 0.2486, logprob -0.6155)
- 253.6s “Why?” (chunk 1.26 s, no_speech 0.1125, logprob -0.4343)
- 439.6s “Yes” (chunk 2.52 s, no_speech 0.3203, logprob -0.7648)
- 544.9s “Ha ha ha!” (chunk 0.86 s, no_speech 0.5189, logprob -1.0139)
- 587.3s “I'm going to eat” (chunk 2.02 s, no_speech 0.142, logprob -1.2244)

## Chunks sent to Whisper

112 chunks, median 3.38 s, mean 3.69 s. Cut/drop reasons: ceiling 22, pause 90

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 16 | 27 | 17 | 15 | 9 | 22 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 350.65 ms, p90 487.4 ms
- End of chunk audio → final emitted: median 0.95 s, p90 1.3 s
- Inference time: finals 53.4 s, partials 159.3 s (325 passes, 74.9% of all inference); realtime factor 0.355

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 1 → recall 20.0%. 864 distinct suggestions (864.0 per 10 min), precision 0.1% (top-1 only: 1.1%). Spoken → suggestion: median 12.797 s, mean 12.797 s. By stage (suggestions / matched / precision / expected refs found first): stage 2: 451 / 1 / 0.2% / 1, stage 4: 413 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 110.66 | 12.8 s | 2 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | — | — | — |
