# Live-feed run: ABC-noisy_room

- Source: I WILL NOT LET YOU GO..... (OPEN AIR CRUSADE @ IGANDO, LAGOS) — https://www.youtube.com/watch?v=NtUddpvsBa8
- Window: 0–600 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 1.2948 (auto captions) | — | 98.9% | 110.3 s | 0.0 | 0.0% / — (n=0) | — |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 1.2948 (S 437, D 21, I 921; 1065 ref words, 1965 hyp words; window [0.0, 600.0])
- **Reference spans** (book names + numbers around 0 spoken references): WER — over 0 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 424.6 |
| VAD recall: caption speech that reached Whisper (%) | 98.9 |
| … covered by VAD alone (%) | 99.2 |
| … passed VAD + worship gate (%) | 99.2 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 110.3 |
| false-open per 10 min (s) | 110.29 |
| VAD open (s) | 582.9 |
| forwarded (s) | 582.9 |
| reached Whisper incl. pre-roll (s) | 582.3 |
| stale-dropped (s) | 0 |
| trimmed (s) | 5.0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

0 finals (0.0 per 10 min, 0 words) were emitted where captions show no speech; 0 during music.


## Chunks sent to Whisper

73 chunks, median 6.98 s, mean 8.0 s. Cut/drop reasons: ceiling 70, pause 3, trim 252

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 1 | 0 | 2 | 43 | 15 | 9 | 3 |

## Latency and compute

- Final inference: median 928.1 ms, p90 10470.4 ms
- End of chunk audio → final emitted: median 1.02 s, p90 10.48 s
- Inference time: finals 260.0 s, partials 243.2 s (157 passes, 48.3% of all inference); realtime factor 0.839

## Scripture detection

Expected references: 0 (from reference parser over auto captions). Found 0 → recall —. 1803 distinct suggestions (1803.0 per 10 min), precision 0.0% (top-1 only: 0.0%). Spoken → suggestion: median —, mean —. By stage (suggestions / matched / precision / expected refs found first): stage 1: 5 / 0 / 0.0% / 0, stage 2: 948 / 0 / 0.0% / 0, stage 4: 850 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
