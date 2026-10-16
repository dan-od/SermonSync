# Live-feed run: ABC-nigerian_human_captions

- Source: God Doesn't Joke About These 3 Things—You Need to Beware of Them | Pastor E.A. Adeboye — https://www.youtube.com/watch?v=ooaB4z653Aw
- Window: 60–660 s (600.0 s) at speed 1.0
- Engine: faster-whisper/base/cpu-int8 · VAD: SileroVAD · captions: auto
- Git: HEAD @ abf3ab0

## Headline

| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | spoken→suggestion (median) |
|---|---|---|---|---|---|---|
| 0.2945 (auto captions) | 0.4839 | 99.8% | 53.6 s | 3.0 | 0.2% / 40.0% (n=5) | 10.207 s |

## WER

- **auto captions** — agreement with YouTube ASR (auto-captions), not accuracy: WER 0.2945 (S 159, D 47, I 44; 849 ref words, 846 hyp words; window [60.0, 660.0])
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

3 finals (3.0 per 10 min, 9 words) were emitted where captions show no speech; 0 during music.

- 428.8s “Now” (chunk 1.4 s, no_speech 0.2854, logprob -0.6788)
- 439.5s “Three, one, two, one.” (chunk 3.92 s, no_speech 0.1269, logprob -0.8774)
- 587.4s “I'm going to eat” (chunk 1.82 s, no_speech 0.1698, logprob -1.3151)

## Chunks sent to Whisper

110 chunks, median 3.26 s, mean 3.54 s. Cut/drop reasons: ceiling 16, pause 94

| 0-1s | 1-2s | 2-3s | 3-4s | 4-5s | 5-6s | 6-8s | 8-10s | 10-15s | 15s+ |
|---|---|---|---|---|---|---|---|---|---|
| 5 | 25 | 19 | 19 | 18 | 8 | 14 | 1 | 1 | 0 |

## Latency and compute

- Final inference: median 368.4 ms, p90 542.2 ms
- End of chunk audio → final emitted: median 0.98 s, p90 1.4 s
- Inference time: finals 52.9 s, partials 169.8 s (309 passes, 76.2% of all inference); realtime factor 0.371

## Scripture detection

Expected references: 5 (from reference parser over auto captions). Found 2 → recall 40.0%. 850 distinct suggestions (850.0 per 10 min), precision 0.2% (top-1 only: 2.2%). Spoken → suggestion: median 10.207 s, mean 10.207 s. By stage (suggestions / matched / precision / expected refs found first): stage 0: 1 / 1 / 100.0% / 1, stage 2: 447 / 1 / 0.2% / 1, stage 4: 402 / 0 / 0.0% / 0.

Precision counts every distinct suggestion against explicitly spoken references only, so allusion matches from stages 2–4 count as misses even when they are reasonable.

| spoken at | expected | via | suggested at | latency | stage |
|---|---|---|---|---|---|
| 97.9 | Proverbs 18:21 | explicit | 104.92 | 7.06 s | 0 |
| 186.7 | Ecclesiastes 5:3 | explicit | — | — | — |
| 607.2 | Mark 5:25-34 | weak | — | — | — |
| 609.4 | Mark 5:34 | weak | — | — | — |
| 648.4 | 2 Corinthians 6:17 | explicit | 661.789 | 13.36 s | 2 |
