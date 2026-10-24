# Live-feed run: fixA-music_under_preaching

- Source: 1 HOUR NON STOP INTENSE WORSHIP SESSION WITH NEON ADEJO LIVE IN BOSTON 🇺🇸 — https://www.youtube.com/watch?v=lJfWmv3eM7c
- Window: 2400–3000 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2699 (auto captions) | — | 81.1% | 22.7 s | 3.0 | 0.0% / — (n=0) | — |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2699 (S 127, D 134, I 38; 1108 ref words, 1012 hyp words; window [2400.0, 3000.0])
- **Reference spans** (book names + numbers around 0 spoken references): WER — over 0 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 405.7 |
| VAD recall: caption speech that reached Whisper (%) | 81.1 |
| … covered by VAD alone (%) | 72.2 |
| … passed VAD + worship gate (%) | 72.2 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 22.7 |
| false-open per 10 min (s) | 22.74 |
| VAD open (s) | 330.8 |
| forwarded (s) | 330.8 |
| reached Whisper incl. pre-roll (s) | 372.3 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

3 finals (3.0 per 10 min, 3 words) were emitted where captions show no speech; 0 during music.

- 2492.5s “Zoom!” (chunk 0.82 s, no_speech 0.338, logprob -1.0127)
- 2493.7s “SHIT” (chunk 0.84 s, no_speech 0.3708, logprob -1.1125)
- 2699.5s “Doo!” (chunk 1.14 s, no_speech 0.3215, logprob -0.9565)

## Chunks sent to Whisper

95 chunks, median 3.88 s, mean 3.98 s. Cut/drop reasons: ceiling 27, pause 68

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 15 | 15 | 15 | 10 | 7 | 26 | 0 | 1 | 0 |

## Latency and compute

- Final inference: median 375.1 ms, p90 466.1 ms
- End of chunk audio → final emitted: median 0.9 s, p90 1.28 s
- Inference time: finals 49.5 s, partials 138.8 s (298 passes, 73.7% of all inference); realtime factor 0.314

## Scripture detection

Expected references: 0 (from reference parser over auto captions). Found 0 → recall —. 677 distinct suggestions (677.0 per 10 min), precision 0.0% (top-1 only: 0.0%). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): stage 1: 3 / 0 / 0.0% / 0, stage 2: 368 / 0 / 0.0% / 0, stage 4: 306 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
