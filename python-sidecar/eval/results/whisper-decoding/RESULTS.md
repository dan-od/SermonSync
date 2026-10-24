# fix/whisper-decoding — results

Measured on top of fixes A and B (the integration build), because on main Whisper hears almost
nothing. "Before" = A (+B where it ran); "after" = A+B+C with the defaults this branch ships:
`condition_on_previous_text=False`, `beam_size=1`, no prompt, hallucination filter on.

## Settings, before → after

| setting | before | after | effect |
|---|---|---|---|
| beam_size | 1 | 1 | unchanged (mlx-whisper has no beam search; keeps Mac and Windows comparable) |
| condition_on_previous_text | True (faster-whisper default) | False | none measurable: it only links 30 s windows inside one call, and chunks are ≤ ~10 s |
| temperature fallback | 0.0 → 1.0 in 0.2 steps | same, now explicit | unchanged |
| compression_ratio_threshold | 2.4 | 2.4, explicit | unchanged; note it did not catch one numeric repetition loop ("3, 1, 2, 3, 1, 1, …") |
| log_prob / no_speech thresholds | -1.0 / 0.6 | same, explicit | faster-whisper already skips segments failing both |
| initial_prompt / hotwords | none | none (tested, not adopted, see below) | |
| hallucination filter | none | short chunk (< 1.2 s, ≤ 2 words) + Whisper-credit blocklist | below |

## Hallucination filter, before → after

Before (fix A, filter off):

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.4047 (upl) | 93.7% | 60.2 s | 0.0 | 0.5% / 36.8% (n=19) | — | 3.833 s |
| explicit refs 2 (Kumuyi) | 0.5168 (auto) | 100.0% | 93.2 s | 0.0 | 0.7% / 54.5% (n=11) | — | 11.428 s |
| Nigerian (Adeboye) | 0.3039 (auto) | 99.8% | 53.6 s | 5.0 | 0.2% / 40.0% (n=5) | — | 12.801 s |
| music under preaching | 0.2699 (auto) | 81.1% | 22.7 s | 3.0 | 0.0% / — (n=0) | — | — |
| noisy open-air | 1.4244 (auto) | 99.5% | 110.3 s | 0.0 | 0.0% / — (n=0) | — | — |
| worship music (no speech) | 0.9423 (auto) | 0.8% | 6.1 s | 4.0 | 0.0% / — (n=0) | — | — |


After (A+B+C):

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.404 (upl) | 93.7% | 60.2 s | 0.0 | 0.9% / 57.9% (n=19) | 75.0% (3/4) | 6.987 s |
| explicit refs 2 (Kumuyi) | 0.5504 (auto) | 100.0% | 93.2 s | 0.0 | 0.5% / 36.4% (n=11) | 100.0% (1/1) | 14.321 s |
| Nigerian (Adeboye) | 0.2945 (auto) | 99.8% | 53.6 s | 3.0 | 0.2% / 40.0% (n=5) | 100.0% (1/1) | 10.207 s |
| music under preaching | 0.2671 (auto) | 81.1% | 22.7 s | 1.0 | 0.0% / — (n=0) | — | — |
| noisy open-air | 1.2948 (auto) | 98.9% | 110.3 s | 0.0 | 0.0% / — (n=0) | — | — |
| worship music (no speech) | 0.9808 (auto) | 0.8% | 6.1 s | 1.0 | 0.0% / — (n=0) | — | — |

Hallucinations per 10 min: worship 4 → 1, music under preaching 3 → 1, Nigerian 5 (4 on the repeat)
→ 3. WER does not get worse on any source beyond the run-to-run noise (about ±0.01–0.02).

The rule was chosen from fix A's runs before these were made: "chunk < 1.2 s and ≤ 2 words" caught
13 of 28 caption-free finals and dropped 12 of 13,435 real words (0.1 %). A no_speech_prob /
avg_logprob rule (> 0.5 and < -0.8) caught 3 and dropped 2.2 % of real words, because most of these
hallucinations score as confident speech ("Zoom!", "Three, one, two, one.", "It's a huge celebration
of the world.").

## Prompt variants (A+B+C, one run each)

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| ABC-explicit_refs | 0.404 | 0.598 | 93.7% | 60.2 s | 0.0 | 57.9% | 3.98 s | 6.16 s / 68 of 105 | 80.6% |
| ABC-tail-explicit_refs | 0.4099 | 0.5686 | 93.2% | 60.2 s | 0.0 | 63.2% | 5.64 s | 6.46 s / 57 of 83 | 78.9% |
| ABC-style-explicit_refs | 0.4497 | 0.6667 | 93.7% | 60.2 s | 0.0 | 68.4% | 5.7 s | 6.22 s / 66 of 89 | 70.0% |
| ABC-hot-explicit_refs | 0.4445 | 0.5392 | 93.7% | 60.2 s | 0.0 | 68.4% | 5.54 s | 6.36 s / 65 of 91 | 69.4% |

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| ABC-explicit_refs_2 | 0.5504 | 0.5714 | 100.0% | 93.2 s | 0.0 | 36.4% | 4.12 s | 6.4 s / 90 of 93 | 82.0% |
| ABC-tail-explicit_refs_2 | 0.9484 | 0.6429 | 96.2% | 93.2 s | 0.0 | 45.5% | 7.76 s | 6.95 s / 67 of 68 | 64.3% |
| ABC-style-explicit_refs_2 | 0.528 | 0.5476 | 100.0% | 93.2 s | 0.0 | 54.5% | 4.85 s | 6.61 s / 83 of 88 | 73.9% |
| ABC-hot-explicit_refs_2 | 0.5112 | 0.619 | 100.0% | 93.2 s | 0.0 | 45.5% | 5.35 s | 6.74 s / 81 of 83 | 74.2% |

| run | WER | ref-span WER | VAD recall | false-open | halluc./10 min | refs R | mean word delay | chunks: median / ceiling cuts | partial share |
|---|---|---|---|---|---|---|---|---|---|
| ABC-nigerian_human_captions | 0.2945 | 0.4839 | 99.8% | 53.6 s | 3.0 | 40.0% | 3.47 s | 3.26 s / 16 of 110 | 76.2% |
| ABC-tail-nigerian_human_captions | 0.3286 | 0.7419 | 99.8% | 53.6 s | 1.0 | 60.0% | 4.66 s | 3.56 s / 25 of 91 | 83.0% |
| ABC-style-nigerian_human_captions | 0.3062 | 0.7097 | 99.8% | 53.6 s | 1.0 | 20.0% | 3.53 s | 3.42 s / 20 of 106 | 80.2% |
| ABC-hot-nigerian_human_captions | 0.3216 | 0.5806 | 99.8% | 53.6 s | 0.0 | 40.0% | 3.86 s | 3.26 s / 16 of 108 | 75.6% |

Stage 0 with each prompt (suggestions / correct / expected references it found first):

| run | Stage 0 suggestions | correct | found first | median spoken→suggestion | suggestions (✗ = wrong) |
|---|---|---|---|---|---|
| ABC-explicit_refs | 4 | 3 | 3 of 19 | 4.33 s | Revelation 5:12, John 3:3, John 3:5, 2 Corinthians 4:8 ✗ |
| ABC-nigerian_human_captions | 1 | 1 | 1 of 5 | 7.06 s | Proverbs 18:21 |
| ABC-explicit_refs_2 | 1 | 1 | 1 of 11 | 3.49 s | Romans 2:29 |
| ABC-tail-explicit_refs | 7 | 3 | 3 of 19 | 2.59 s | Romans 2:22 ✗, Romans 2:2 ✗, Revelation 5:2 ✗, Revelation 5:12, Revelation 5:5 ✗, 2 Corinthians 4:4, Job 32:8 |
| ABC-style-explicit_refs | 10 | 4 | 4 of 19 | 2.8 s | 1 Corinthians 2:2 ✗, 1 Corinthians 1:21 ✗, Revelation 5:12, Matthew 13:54, John 3:1 ✗, 1 Corinthians 13:1 ✗, 1 Corinthians 12:1 ✗, 1 Corinthians 12:5 ✗, 2 Corinthians 4:4, Job 32:8 |
| ABC-hot-explicit_refs | 11 | 6 | 7 of 19 | 4.05 s | John 3:6 ✗, 1 Corinthians 13:8 ✗, Jeremiah 8:20, Jeremiah 8:2 ✗, Ephesians 2:5, Revelation 5:12, John 3:8 ✗, John 3:5, 2 Corinthians 4:4, Job 32:8, Isaiah 37:1 ✗ |
| ABC-tail-explicit_refs_2 | 4 | 3 | 3 of 11 | 4.61 s | Isaiah 2:9 ✗, Romans 2:28, Romans 2:29, Colossians 2:11 |
| ABC-style-explicit_refs_2 | 6 | 2 | 2 of 11 | 1.97 s | Colossians 2:16 ✗, Acts 5:7 ✗, Acts 5:8 ✗, Acts 5:9 ✗, Romans 2:28, Romans 2:29 |
| ABC-hot-explicit_refs_2 | 5 | 3 | 3 of 11 | 3.29 s | Luke 16:16 ✗, Joshua 5:7, Joshua 5:9, Joshua 5:13 ✗, Romans 2:29 |
| ABC-tail-nigerian_human_captions | 1 | 1 | 1 of 5 | 4.7 s | Mark 5:25 |
| ABC-style-nigerian_human_captions | 1 | 1 | 1 of 5 | 3.7 s | Proverbs 18:21 |
| ABC-hot-nigerian_human_captions | 2 | 2 | 2 of 5 | 5.0 s | Proverbs 18:21, Mark 5:25 |

- **final_tail** (last ~200 chars of final text): rejected. On the Kumuyi source Whisper started
  inventing text — 1,225 words against 892 in the captions, 419 insertions, WER 0.55 → 0.95.
- **style** (written reference formats + "Foursquare Gospel Church"): rejected. WER is worse on two
  of three sources, and Whisper copies the prompt: spurious "1 Corinthians 12:1", "1 Corinthians
  13:1", "1 Corinthians 2:2" appear because the prompt contains "1 Corinthians 13:4-7". Stage 0
  precision falls to 40 %.
- **hotwords** (same text as faster-whisper hotwords): not adopted, but the most interesting.
  Whisper writes references as digits far more often, so Stage 0 finds 12 of 35 expected references
  vs 5 of 35 with no prompt, at 61 % precision vs 83 %. WER is mixed (+0.04, −0.04, +0.03). A
  hotword list without specific verses (book names and "chapter … verse …" only) is worth a run.
- **none**: kept as the default.
