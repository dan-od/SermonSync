# Live-feed run: fixA-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.3039 (auto captions) | 0.5806 | 99.8% | 53.6 s | 5.0 | 0.2% / 40.0% (n=5) | 12.801 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.3039 (S 178, D 40, I 40; 849 ref words, 849 hyp words; window [60.0, 660.0])
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

5 finals (5.0 per 10 min, 9 words) were emitted where captions show no speech; 0 during music.

- 210.5s “Three” (chunk 0.88 s, no_speech 0.2501, logprob -0.6509)
- 253.4s “Why?” (chunk 1.06 s, no_speech 0.1173, logprob -0.4182)
- 439.5s “Three, one, two, one.” (chunk 3.92 s, no_speech 0.1269, logprob -0.8774)
- 543.6s “haha” (chunk 0.66 s, no_speech 0.5215, logprob -0.7957)
- 587.2s “Let's eat!” (chunk 1.82 s, no_speech 0.1698, logprob -1.3066)

## Chunks sent to Whisper

115 chunks, median 3.24 s, mean 3.39 s. Cut/drop reasons: ceiling 14, pause 101

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 25 | 25 | 24 | 17 | 7 | 14 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 347.4 ms, p90 408.3 ms
- End of chunk audio → final emitted: median 0.94 s, p90 1.32 s
- Inference time: finals 52.4 s, partials 145.7 s (317 passes, 73.6% of all inference); realtime factor 0.33

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 917 distinct suggestions (917.0 per 10 min), precision 0.2% (top-1 only: 2.0%). Spoken → suggestion: median 12.801 s, mean 12.801 s. By stage (suggestions / matched / precision / expected refs found first): stage 2: 491 / 2 / 0.4% / 2, stage 4: 426 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 110.56 | 12.7 s | 2 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 661.337 | 12.91 s | 2 |
