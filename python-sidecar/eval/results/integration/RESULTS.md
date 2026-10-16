# feat/stt-pipeline-fixes — integration check

All six branches merged (harness, A, C, B, D, E), default settings (silence flush 0.8 s, ceiling 6 s,
partials "main", hallucination filter on, no prompt). faster-whisper `base`, CPU int8, 48 kHz, speed
1.0, scratch sidecar on port 8010. Compared with the stacked runs made before the merge
(`ABC-*` in `whisper-decoding/`, `D-sf0.8-*` in `utterance-segmentation/`).

| run | WER (auto captions) | VAD recall | false-open | halluc./10 min | refs P / R | Stage 0 | suggestions (stage 2 / 4) | spoken→sugg. median |
|---|---|---|---|---|---|---|---|---|
| ABC-nigerian (before, flush 0.45) | 0.2945 | 99.8% | 53.6 s | 3.0 | 0.2% / 40% | 1 of 1 right | 850 (447 / 402) | 10.2 s |
| D-sf0.8-nigerian (before, flush 0.8) | 0.2815 | 99.8% | 53.6 s | 0.0 | 0.2% / 40% | 1 of 1 right | 825 (436 / 388) | 8.5 s |
| **INT-nigerian** | **0.2839** | **99.8%** | **53.6 s** | **2.0** | **0.5% / 60%** | **2 of 2 right** | **881 (446 / 433)** | **7.5 s** |
| ABC-worship (before) | 0.9808 | 0.8% | 6.1 s | 1.0 | 0% / — | none | 20 (10 / 10) | — |
| **INT-worship** | **0.9487** | **0.8%** | **6.1 s** | **2.0** | **0% / —** | **none** | **17 (10 / 7)** | — |

- VAD is identical to the stacked runs. WER and hallucinations are within run-to-run noise (±0.01–0.02
  WER, ±1–2 hallucinations; there are 1–5 per 10 min).
- Stage 0 found Proverbs 18:21 (7.5 s) and Mark 5:25-34 (5.2 s), both right.
- Deck flood unchanged: 881 vs 825–850 suggestions on the Nigerian source (+4–7 %, within the spread
  of earlier repeats), 17 vs 20 on worship. Stage 2/4 precision still ~0.2 %.
