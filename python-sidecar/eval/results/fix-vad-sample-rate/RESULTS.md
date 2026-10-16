# fix/vad-sample-rate — results

Same six sources, same engine (faster-whisper `base`, CPU int8), 48 kHz, speed 1.0. Defaults: VAD and
worship detection on the 16 kHz mono array, Silero hangover 300 ms, pre-roll 300 ms, stateful
anti-aliased resampler. Baseline numbers: `eval/results/baseline/RESULTS.md`.

## Before (main)

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.9869 (upl) | 1.6% | 0.6 s | 0.0 | 0.0% / 0.0% (n=19) | — | — |
| explicit refs 2 (Kumuyi) | 1.0 (auto) | 0.0% | 0 s | 0.0 | — / 0.0% (n=11) | — | — |
| Nigerian (Adeboye) | 1.0 (auto) | 0.0% | 0 s | 0.0 | — / 0.0% (n=5) | — | — |
| music under preaching | 1.0 (auto) | 0.0% | 0 s | 0.0 | — / — (n=0) | — | — |
| noisy open-air | 0.9991 (auto) | 0.2% | 0 s | 0.0 | 0.0% / — (n=0) | — | — |
| worship music (no speech) | 1.0 (auto) | 0.0% | 0.2 s | 0.0 | — / — (n=0) | — | — |


## After (this branch)

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.4047 (upl) | 93.7% | 60.2 s | 0.0 | 0.5% / 36.8% (n=19) | — | 3.833 s |
| explicit refs 2 (Kumuyi) | 0.5168 (auto) | 100.0% | 93.2 s | 0.0 | 0.7% / 54.5% (n=11) | — | 11.428 s |
| Nigerian (Adeboye) | 0.3039 (auto) | 99.8% | 53.6 s | 5.0 | 0.2% / 40.0% (n=5) | — | 12.801 s |
| music under preaching | 0.2699 (auto) | 81.1% | 22.7 s | 3.0 | 0.0% / — (n=0) | — | — |
| noisy open-air | 1.4244 (auto) | 99.5% | 110.3 s | 0.0 | 0.0% / — (n=0) | — | — |
| worship music (no speech) | 0.9423 (auto) | 0.8% | 6.1 s | 4.0 | 0.0% / — (n=0) | — | — |

WER here is agreement with YouTube auto captions or an uploaded track of unverified origin, not
accuracy. The noisy open-air source scores above 1.0 because its auto captions are sparse (the audio
is poor): Whisper now writes more words than YouTube did. On worship music, VAD stays closed on
99 % of the sung "caption speech" (lyrics), and 4 short hallucinations per 10 min get through.

Precision is low on every source because matcher stages 2 and 4 now emit a flood of suggestions
(~1,300 distinct per 10 min on the first source) for every transcribed sentence; that is outside
this fix and is listed in the report as the next problem.

## Variants and noise

Identical runs are not bit-identical: pause detection runs on the wall clock, so chunk boundaries
and therefore transcripts shift slightly. The `repeat` rows are the same config run again.

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| fixA-explicit_refs | 0.4047 | 0.6471 | 93.7% | 60.2 s | 0.0 | 36.8% | 4.18 s | 6.2 s / 71 of 99 | 82.7% |
| fixA-repeat-explicit_refs | 0.3969 | 0.5588 | 93.7% | 60.2 s | 0.0 | 52.6% | 4.01 s | 6.22 s / 73 of 103 | 80.2% |
| fixA-legacyresample-explicit_refs | 0.3871 | 0.5392 | 93.7% | 60.0 s | 0.0 | 52.6% | 4.23 s | 6.12 s / 71 of 100 | 78.7% |
| fixA-hang150-explicit_refs | 0.3708 | 0.7745 | 91.0% | 55.9 s | 1.0 | 57.9% | 4.3 s | 6.08 s / 59 of 104 | 78.1% |
| fixA-hang500-explicit_refs | 0.3779 | 0.6569 | 96.2% | 63.3 s | 0.0 | 52.6% | 4.21 s | 6.32 s / 78 of 94 | 80.2% |
| baseline16k-explicit_refs | 0.3871 | 0.7353 | 87.6% | 56.2 s | 0.0 | 57.9% | 4.24 s | 6.03 s / 57 of 104 | 78.0% |

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| fixA-nigerian_human_captions | 0.3039 | 0.5806 | 99.8% | 53.6 s | 5.0 | 40.0% | 3.07 s | 3.24 s / 14 of 115 | 73.6% |
| fixA-repeat-nigerian_human_captions | 0.3251 | 0.4839 | 99.8% | 53.6 s | 4.0 | 40.0% | 3.68 s | 3.08 s / 19 of 111 | 70.3% |
| fixA-legacyresample-nigerian_human_captions | 0.3157 | 0.5806 | 99.8% | 53.2 s | 4.0 | 20.0% | 3.36 s | 3.04 s / 19 of 111 | 79.8% |
| fixA-hang150-nigerian_human_captions | 0.2968 | 0.3548 | 99.5% | 34.5 s | 6.0 | 40.0% | 3.01 s | 2.7 s / 11 of 121 | 77.1% |
| fixA-hang500-nigerian_human_captions | 0.3015 | 0.6129 | 99.8% | 78.0 s | 5.0 | 20.0% | 3.32 s | 3.38 s / 22 of 112 | 74.9% |
| baseline16k-nigerian_human_captions | 0.331 | 0.6774 | 98.1% | 36.6 s | 4.0 | 40.0% | 3.03 s | 2.42 s / 11 of 121 | 75.0% |

- Noise floor between identical runs: about ±0.01 WER, ±0.3 s word delay, and up to ±15 points of
  reference recall (n = 5–19 references per source, and Whisper `base` mangles many of them).
- Stateful resampler vs the old per-frame one (`legacyresample`): no difference measurable with
  Whisper `base`. Kept because it is correct by construction (no 50 Hz phase glitch, no aliasing:
  see `tests/test_vad_sample_rate.py`), not because the harness shows a gain.
- Hangover 150 ms beats 300 ms on both sources (WER −0.03 / −0.01, false-open −4 s / −19 s, more
  pause cuts and fewer 6 s ceiling cuts) for slightly lower VAD recall; 500 ms is worse. The default
  stays 300 ms for now because hangover and the utterance silence threshold act together (a pause
  must outlast both) and the segmentation sweep (fix D) was run at 300 ms; choose the pair together.
- `baseline16k` is main's code fed at 16 kHz: it confirms the sample-rate bug as the cause, and this
  branch's longer hangover and pre-roll add 2–6 points of recall on top.
