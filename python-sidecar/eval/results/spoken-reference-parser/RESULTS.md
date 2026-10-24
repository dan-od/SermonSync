# feat/spoken-reference-parser — results

Stage 0 is code-independent of the VAD fix, but on main Whisper hears almost nothing (VAD recall
0–1.6 %), so there is nothing for Stage 0 to parse. It was measured both ways.

## Stage 0 alone (on main)

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.9883 (upl) | 1.6% | 0.6 s | 0.0 | 0.0% / 0.0% (n=19) | — | — |

As expected: no change from baseline, because no reference ever reaches the transcript.

## Stage 0 on top of the VAD fix (A+B) — before: A only

Before (fix A):

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
| explicit refs (Living Faith) | 0.4047 (upl) | 93.7% | 60.2 s | 0.0 | 0.5% / 36.8% (n=19) | — | 3.833 s |
| explicit refs 2 (Kumuyi) | 0.5168 (auto) | 100.0% | 93.2 s | 0.0 | 0.7% / 54.5% (n=11) | — | 11.428 s |
| Nigerian (Adeboye) | 0.3039 (auto) | 99.8% | 53.6 s | 5.0 | 0.2% / 40.0% (n=5) | — | 12.801 s |

After (A+B; the integration build with fix C's filter switched off):

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.4151 (upl) | 93.2% | 60.2 s | 0.0 | 1.0% / 68.4% (n=19) | 100.0% (6/6) | 3.533 s |
| explicit refs 2 (Kumuyi) | 0.4809 (auto) | 100.0% | 93.2 s | 0.0 | 0.3% / 18.2% (n=11) | — | 15.988 s |
| Nigerian (Adeboye) | 0.3486 (auto) | 99.8% | 53.6 s | 4.0 | 0.1% / 20.0% (n=5) | 50.0% (1/2) | 5.537 s |

Overall reference recall moves within run-to-run noise (identical fix-A runs gave 36.8 % and 52.6 %
on the first source). What Stage 0 itself does is clearer:

| run | Stage 0 suggestions | correct | expected refs it found first | median spoken→suggestion | suggestions (✗ = wrong) |
|---|---|---|---|---|---|
| AB-explicit_refs | 6 | 6 | 6 of 19 | 5.2 s | 1 Peter 2:24, Revelation 5:12, John 3:3, John 3:5, 2 Corinthians 4:4, Job 32:8 |
| AB-explicit_refs_2 | 0 | 0 | 0 of 11 | — s |  |
| AB-nigerian_human_captions | 2 | 1 | 1 of 5 | 5.54 s | Proverbs 18:21, Mark 5:35 ✗ |
| ABC-explicit_refs | 4 | 3 | 3 of 19 | 4.33 s | Revelation 5:12, John 3:3, John 3:5, 2 Corinthians 4:8 ✗ |
| ABC-nigerian_human_captions | 1 | 1 | 1 of 5 | 7.06 s | Proverbs 18:21 |
| ABC-explicit_refs_2 | 1 | 1 | 1 of 11 | 3.49 s | Romans 2:29 |

Across these five runs Stage 0 made 14 suggestions and 12 were right (86 %), against well under 1 %
for stages 2–4. Its recall is capped by Whisper `base`, not by the parser: on the Kumuyi source the
transcript reads "Just sure, five, seven" for "Joshua 5:7", and on the Living Faith source
"Efficiency 526" for "Ephesians 2:5-6". Where Whisper writes the reference, Stage 0 finds it in
about 5 s from when it was spoken (end of the utterance + inference + parsing).

The two wrong ones:
- "Mark 5:35": Whisper wrote "Mark 5.35.34." for "Mark chapter 5 25 to 34"; Stage 0 read Whisper's
  digits correctly.
- "2 Corinthians 4:8": a carry-over error. About 60 s after "second Corinthians 4" the preacher said
  "Job 32 verse 8"; Whisper dropped "Job 32" and wrote "that is to verse 8", which carried over to
  the last passage named. That is the cost of carry-over (context lives 300 s); a book name the ASR
  drops cannot be recovered from text.
