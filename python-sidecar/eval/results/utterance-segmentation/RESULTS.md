# fix/utterance-segmentation — sweep results

**Picked: silence_flush 0.8 s, ceiling 6 s (option 1), min chunk 0.4 s unchanged.**

Swept one knob at a time from today's defaults (silence_flush 0.45 s, min chunk 0.4 s, ceiling 6 s),
speed 1.0, on the integration build (fixes A + B + C + partials setting, hangover 300 ms). Two
sources: the Living Faith preacher barely pauses (most chunks hit the ceiling); the Adeboye clip has
natural pauses.

"Mean word delay" is the duration-weighted average of (final emitted − chunk midpoint): roughly how
long after a word is spoken it appears as final text. It captures what the ceiling costs, which
"speech end → final" does not. Noise floor between identical runs: about ±0.01 WER, ±0.3 s delay.

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| ABC-explicit_refs | 0.404 | 0.598 | 93.7% | 60.2 s | 0.0 | 57.9% | 3.98 s | 6.16 s / 68 of 105 | 80.6% |
| D-sf0.6-explicit_refs | 0.3962 | 0.5392 | 93.5% | 60.2 s | 0.0 | 63.2% | 4.18 s | 6.19 s / 75 of 100 | 78.4% |
| D-sf0.8-explicit_refs | 0.3675 | 0.5686 | 93.7% | 60.2 s | 0.0 | 57.9% | 4.15 s | 6.24 s / 79 of 94 | 80.4% |
| D-min1.0-explicit_refs | 0.3949 | 0.5686 | 93.6% | 60.2 s | 0.0 | 68.4% | 4.65 s | 6.21 s / 71 of 94 | 73.7% |
| D-ceil10-explicit_refs | 0.3453 | 0.6471 | 93.6% | 60.2 s | 0.0 | 68.4% | 5.68 s | 9.82 s / 35 of 71 | 83.6% |
| D-ceil15-explicit_refs | 0.3303 | 0.6373 | 92.9% | 60.2 s | 0.0 | 52.6% | 7.45 s | 11.79 s / 19 of 56 | 87.3% |

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| ABC-nigerian_human_captions | 0.2945 | 0.4839 | 99.8% | 53.6 s | 3.0 | 40.0% | 3.47 s | 3.26 s / 16 of 110 | 76.2% |
| D-sf0.6-nigerian_human_captions | 0.3145 | 0.6452 | 99.8% | 53.6 s | 1.0 | 40.0% | 3.48 s | 3.42 s / 22 of 106 | 79.0% |
| D-sf0.8-nigerian_human_captions | 0.2815 | 0.6452 | 99.8% | 53.6 s | 0.0 | 40.0% | 3.52 s | 3.44 s / 24 of 103 | 79.9% |
| D-min1.0-nigerian_human_captions | 0.318 | 0.7097 | 99.8% | 53.6 s | 2.0 | 40.0% | 3.23 s | 3.08 s / 16 of 111 | 76.0% |
| D-ceil10-nigerian_human_captions | 0.2945 | 0.4194 | 99.8% | 53.6 s | 1.0 | 60.0% | 3.94 s | 2.87 s / 5 of 102 | 79.8% |
| D-ceil15-nigerian_human_captions | 0.2886 | 0.5484 | 99.8% | 53.6 s | 1.0 | 40.0% | 4.34 s | 3.06 s / 2 of 97 | 80.9% |

(`ABC-*` is the default configuration.)

| change | WER Δ (Living Faith / Adeboye) | word delay Δ | read |
|---|---|---|---|
| silence_flush 0.6 s | −0.01 / +0.02 | +0.2 / 0.0 s | noise |
| silence_flush 0.8 s | −0.04 / −0.01 | +0.2 / +0.05 s | cheapest gain |
| min chunk 1.0 s | −0.01 / +0.02 | +0.7 / −0.2 s | noise |
| ceiling 10 s | −0.06 / 0.00 | +1.7 / +0.5 s | gain only for non-stop speakers |
| ceiling 15 s | −0.07 / −0.01 | +3.5 / +0.9 s | small extra gain, large delay |

From fix A's runs (hangover is part of the same decision: a pause must outlast hangover +
silence_flush before an utterance is cut):

| hangover | WER (Living Faith / Adeboye) | VAD false-open | ceiling cuts |
|---|---|---|---|
| 150 ms | 0.37 / 0.30 | 56 / 35 s | 59 of 104 / 11 of 121 |
| 300 ms (default) | 0.40 / 0.30–0.33 | 60 / 54 s | 71–73 of ~100 / 14–19 of ~113 |
| 500 ms | 0.38 / 0.30 | 63 / 78 s | 78 of 94 / 22 of 112 |

Candidate defaults (option 1 chosen and committed):
1. silence_flush 0.8 s, ceiling 6 s — the safe win, latency unchanged.
2. silence_flush 0.8 s, ceiling 10 s — more accuracy on preachers who never pause, ~+1.5 s delay.
3. Either of the above with hangover 150 ms — less false-open; needs one combined run to confirm.
