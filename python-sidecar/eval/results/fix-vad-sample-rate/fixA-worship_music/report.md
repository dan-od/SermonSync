# Live-feed run: fixA-worship_music

- Source: AFTERNOON WORSHIP ENCOUNTER || 8th December 2022 — https://www.youtube.com/watch?v=aeNAHcly6kE
- Window: 1200–1800 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: fix/vad-sample-rate @ 3c9212a

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.9423 (auto captions) | — | 0.8% | 6.1 s | 4.0 | 0.0% / — (n=0) | — |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.9423 (S 30, D 117, I 0; 156 ref words, 39 hyp words; window [1200.0, 1800.0])
- **Reference spans** (book names + numbers around 0 spoken references): WER — over 0 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 77.9 |
| VAD recall: caption speech that reached Whisper (%) | 0.8 |
| … covered by VAD alone (%) | 0.5 |
| … passed VAD + worship gate (%) | 0.5 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 6.1 |
| false-open per 10 min (s) | 6.1 |
| VAD open (s) | 6.5 |
| forwarded (s) | 6.5 |
| reached Whisper incl. pre-roll (s) | 8.1 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

4 finals (4.0 per 10 min, 25 words) were emitted where captions show no speech; 4 during music.

- 1744.7s “I'm gonna bar-a-do-o.” (chunk 0.94 s, no_speech 0.509, logprob -1.5428, music)
- 1749.3s “This is Katani, it's all over the world.” (chunk 2.0 s, no_speech 0.2731, logprob -1.2039, music)
- 1758.0s “It's a huge celebration of the world.” (chunk 4.52 s, no_speech 0.1838, logprob -1.3885, music)
- 1758.0s “It's a huge celebration of the world.” (chunk 4.52 s, no_speech 0.1838, logprob -1.3885, music)

## Chunks sent to Whisper

4 chunks, median 1.54 s, mean 2.06 s. Cut/drop reasons: pause 4

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 0 | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 1927.35 ms, p90 2799.4 ms
- End of chunk audio → final emitted: median 2.92 s, p90 6.5 s
- Inference time: finals 7.9 s, partials 7.4 s (4 passes, 48.3% of all inference); realtime factor 0.025

## Scripture detection

Expected references: 0 (from reference parser over auto captions). Found 0 → recall —. 34 distinct suggestions (34.0 per 10 min), precision 0.0% (top-1 only: 0.0%). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): stage 2: 18 / 0 / 0.0% / 0, stage 4: 16 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
