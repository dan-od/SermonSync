# feat/partials-setting — results (E)

Interim ("partial") passes re-run Whisper on the last ~3 s of buffered speech about once a second.
Across every run in this harness they took **48–87 % of all inference time** (partial share in each
run's report, "Latency and compute"). Measured on the integration build (fixes A + B + C), speed 1.0,
CPU int8 `base`:

| run | partial passes | partial inference | final inference | partial share | median partial pass | WER | mean word delay |
|---|---|---|---|---|---|---|---|
| ABC-explicit_refs | 347 | 265.7 s | 63.9 s | 80.6% | 365.3 ms | 0.404 | 3.98 s |
| E-tiny-explicit_refs | 383 | 164.6 s | 77.3 s | 68.1% | 199.3 ms | 0.4158 | 3.84 s |
| E-off-explicit_refs | 0 | 0.0 s | 101.5 s | 0.0% | None ms | 0.3975 | 3.89 s |
| ABC-nigerian_human_captions | 309 | 169.8 s | 52.9 s | 76.2% | 361.0 ms | 0.2945 | 3.47 s |
| E-tiny-nigerian_human_captions | 311 | 87.7 s | 63.6 s | 58.0% | 185.3 ms | 0.3628 | 3.28 s |
| E-off-nigerian_human_captions | 0 | 0.0 s | 52.8 s | 0.0% | None ms | 0.3027 | 2.89 s |

- **off** removes 60–80 % of the inference load with no WER cost beyond noise (0.404 → 0.398,
  0.295 → 0.303) and words land as finals slightly sooner (−0.1 / −0.6 s), because finals no longer
  queue behind interim passes. The cost is UX: no "[HEARING]" line in the timeline.
- **tiny.en** halves each interim pass (~360 → ~190 ms) and cuts interim inference by 40–50 %. The
  Adeboye WER rise (0.295 → 0.363) comes from one runaway repetition in a *final* ("3, 1, 2, 3, 1, 1,
  …", ~40 tokens) on a crowd-counting stretch, not from the interim model; finals still use `base`.
- On a CPU-only machine with a bigger final model, interim passes on the main model will compete
  harder with finals; this setting is the lever. The default stays "main" (today's behaviour).

Set with `PUT /api/transcription/partials {"mode": "off" | "tiny.en" | "base.en" | "main"}`
(persisted).
