# Live-feed run: baseline16k-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: feat/ss-072-live-feed-harness @ b9baf82

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.331 (auto captions) | 0.6774 | 98.1% | 36.6 s | 4.0 | 0.2% / 40.0% (n=5) | 12.521 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.331 (S 182, D 54, I 45; 849 ref words, 840 hyp words; window [60.0, 660.0])
- **Reference spans** (book names + numbers around 5 spoken references): WER 0.6774 over 31 words
- Normalizer: whisper EnglishTextNormalizer

## VAD and gating

| metric | value |
|---|---|
| caption speech (s) | 267.6 |
| VAD recall: caption speech that reached Whisper (%) | 98.1 |
| … covered by VAD alone (%) | 91.9 |
| … passed VAD + worship gate (%) | 91.9 |
| caption speech lost to stale-drop (s) | 0 |
| VAD false-open: forwarded with no caption speech (s) | 36.6 |
| false-open per 10 min (s) | 36.63 |
| VAD open (s) | 315.8 |
| forwarded (s) | 315.8 |
| reached Whisper incl. pre-roll (s) | 339.7 |
| stale-dropped (s) | 0 |
| trimmed (s) | 0 |
| scene = WORSHIP (s) | 0 |

**Worship gate (F):** 0 s of caption speech that VAD heard was blocked because the scene was WORSHIP (0.0% of caption speech); 0 s of caption speech fell in WORSHIP overall.

## Hallucinations

4 finals (4.0 per 10 min, 5 words) were emitted where captions show no speech; 0 during music.

- 210.9s “Prec” (chunk 0.58 s, no_speech 0.4331, logprob -1.0351)
- 248.5s “Until you” (chunk 1.22 s, no_speech 0.1781, logprob -0.6681)
- 253.3s “Why?” (chunk 0.72 s, no_speech 0.1859, logprob -0.6074)
- 439.6s “Yes.” (chunk 0.92 s, no_speech 0.3548, logprob -0.8241)

## Chunks sent to Whisper

121 chunks, median 2.42 s, mean 2.82 s. Cut/drop reasons: ceiling 11, pause 110

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 40 | 34 | 20 | 6 | 5 | 11 | 0 | 0 | 0 |

## Latency and compute

- Final inference: median 339.1 ms, p90 414.3 ms
- End of chunk audio → final emitted: median 0.94 s, p90 1.3 s
- Inference time: finals 49.8 s, partials 149.3 s (282 passes, 75.0% of all inference); realtime factor 0.332

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 1042 distinct suggestions (1042.0 per 10 min), precision 0.2% (top-1 only: 1.0%). Spoken → suggestion: median 12.521 s, mean 12.521 s. By stage (suggestions / matched / precision / expected refs found first): stage 2: 528 / 2 / 0.4% / 2, stage 4: 514 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 110.4 | 12.54 s | 2 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 660.937 | 12.51 s | 2 |
