# Live-feed run: ABC-worship_music

- Source: AFTERNOON WORSHIP ENCOUNTER || 8th December 2022 — https://www.youtube.com/watch?v=aeNAHcly6kE
- Window: 1200–1800 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.9808 (auto captions) | — | 0.8% | 6.1 s | 1.0 | 0.0% / — (n=0) | — |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.9808 (S 14, D 139, I 0; 156 ref words, 17 hyp words; window [1200.0, 1800.0])
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

1 finals (1.0 per 10 min, 10 words) were emitted where captions show no speech; 1 during music.

- 1758.0s “A telebranded fellow gross in India, Taya Marendos, Sakadana Marendo...” (chunk 4.52 s, no_speech 0.1838, logprob -1.3596, music)

## Chunks sent to Whisper

3 chunks, median 3.08 s, mean 2.75 s. Cut/drop reasons: pause 3

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 1521.7 ms, p90 2885.2 ms
- End of chunk audio → final emitted: median 1.98 s, p90 6.5 s
- Inference time: finals 4.7 s, partials 9.9 s (3 passes, 67.7% of all inference); realtime factor 0.024

## Scripture detection

Expected references: 0 (from reference parser over auto captions). Found 0 → recall —. 20 distinct suggestions (20.0 per 10 min), precision 0.0% (top-1 only: 0.0%). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): stage 2: 10 / 0 / 0.0% / 0, stage 4: 10 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
