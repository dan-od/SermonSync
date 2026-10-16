# Baseline — what main loads today

Engine: faster-whisper `base`, CPU int8 (the code default on main; `GET /api/transcription/engine` →
`{"model":"base","loaded_model":"base","device":"cpu","compute_type":"int8","is_mock":false,"degraded":false}`).
VAD: Silero v5. Every source fed at 48 kHz (a typical built-in mic rate), speed 1.0, 10-minute windows
from `eval/sources.yaml`. Scored with `scripts/score_run.py`.

**None of the sources has verified human captions.** The Adeboye "manual" track is a 0.975 copy of
YouTube's auto captions; the Living Faith uploaded track differs (0.83) but reads like another ASR. So
every WER below is *agreement with another ASR*, not accuracy, until hand-corrected `reference.txt`
files exist (see `eval/sources.yaml`). Expected references come from the reference parser over the
caption text.

### baseline
| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.9869 (upl) | 1.6% | 0.6 s | 0.0 | 0.0% / 0.0% (n=19) | — | — |
| explicit refs 2 (Kumuyi) | 1.0 (auto) | 0.0% | 0 s | 0.0 | — / 0.0% (n=11) | — | — |
| Nigerian (Adeboye) | 1.0 (auto) | 0.0% | 0 s | 0.0 | — / 0.0% (n=5) | — | — |
| music under preaching | 1.0 (auto) | 0.0% | 0 s | 0.0 | — / — (n=0) | — | — |
| noisy open-air | 0.9991 (auto) | 0.2% | 0 s | 0.0 | 0.0% / — (n=0) | — | — |
| worship music (no speech) | 1.0 (auto) | 0.0% | 0.2 s | 0.0 | — / — (n=0) | — | — |

On main, Whisper receives almost none of the speech: VAD recall is 0–1.6 % on every source, so WER
is ~1.0 and no spoken reference is ever detected.

## Control: the same main code, source fed at 16 kHz

| source | WER (vs) | VAD recall | VAD false-open | halluc./10 min | refs P / R | Stage 0 P | spoken→sugg. median |
|---|---|---|---|---|---|---|---|
| explicit refs (Living Faith) | 0.3871 (upl) | 87.6% | 56.2 s | 0.0 | 0.9% / 57.9% (n=19) | — | 7.02 s |
| Nigerian (Adeboye) | 0.331 (auto) | 98.1% | 36.6 s | 4.0 | 0.2% / 40.0% (n=5) | — | 12.521 s |

Fed at 16 kHz, main's own pipeline hears 88–98 % of the speech. The 48 kHz failure is therefore the
VAD sample-rate bug (Silero is a 16 kHz model and was handed device-rate frames), not the harness.
Fixed in `fix/vad-sample-rate`.
