"""Score a recorded live-feed run (SS-072).

Reads `<run_dir>/events.jsonl` + `meta.json` (+ `captions.vtt`, and optional
`reference.txt` / `expected_refs.json`) and writes `report.md` and
`metrics.json` next to them. CLI: scripts/score_run.py.

Reference text, in priority order:
1. a hand-corrected `reference.txt` for a window of the run — in the run dir
   or `eval/references/<source_id>/reference.txt`. Optional first line
   `# window: <start>-<end>` (source seconds); otherwise the whole run.
2. human-made captions;
3. YouTube auto-captions. These are YouTube's own ASR output, so WER against
   them is reported as "agreement with YouTube ASR", not accuracy.

Expected scripture references come from `expected_refs.json` when present,
otherwise from running the live reference parser over the caption text.

Dev-only: needs jiwer and whisper-normalizer (requirements-dev.txt).
"""

from __future__ import annotations

import json
from pathlib import Path

from .detection_scoring import (
    Expected,
    Prediction,
    detection,
    expected_from_captions,
    expected_from_json,
    expected_played,
    predictions,
)
from .intervals import _median, _p90, _pct, clip, intersect, merge, pad, subtract, total
from .run_data import Final, Run, event_intervals, load_run, state_intervals
from .vad_scoring import score_vad
from .wer import (
    NORMALIZER,
    REFERENCES_DIR,
    SIDECAR_DIR,
    Reference,
    _find_file,
    caption_reference,
    hypothesis_text,
    load_captions,
    load_reference_txt,
    normalize,
    ref_span_wer,
    wer_block,
)

__all__ = [
    "Expected",
    "Final",
    "NORMALIZER",
    "Prediction",
    "REFERENCES_DIR",
    "Reference",
    "Run",
    "SIDECAR_DIR",
    "caption_reference",
    "clip",
    "detection",
    "event_intervals",
    "expected_from_captions",
    "expected_from_json",
    "hypothesis_text",
    "intersect",
    "load_captions",
    "load_reference_txt",
    "load_run",
    "merge",
    "normalize",
    "pad",
    "predictions",
    "ref_span_wer",
    "score_vad",
    "state_intervals",
    "subtract",
    "total",
    "wer_block",
]

CHUNK_BINS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 15]


def score_run(run: Run) -> tuple[dict, dict]:
    """Returns (metrics, details) for a loaded run."""
    meta, window = run.meta, run.duration
    engine = meta.get("engine") or {}
    source = meta.get("source") or {}
    per10 = (lambda x: round(x * 600 / window, 2)) if window else (lambda x: None)
    metrics: dict = {
        "run": {
            "dir": run.run_dir.name,
            "label": meta.get("request", {}).get("label"),
            "title": source.get("title"),
            "source": source.get("url") or source.get("source"),
            "window": [round(run.segments[0][0], 2), round(run.segments[-1][1], 2)]
            if run.segments
            else [round(run.start, 2), round(run.end, 2)],
            "played": [[round(a, 2), round(b, 2)] for a, b in run.played],
            "seeks": sum(1 for e in run.events if e["type"] == "seek"),
            "duration_s": round(window, 1),
            "speed": meta.get("request", {}).get("speed"),
            "overrides": meta.get("request", {}).get("overrides") or {},
            "captions": source.get("captions_kind"),
            "engine": {
                "model": engine.get("loaded_model") or engine.get("configured_model"),
                "device": engine.get("device"),
                "compute_type": engine.get("compute_type"),
                "backend": engine.get("backend", "faster-whisper"),
            },
            "vad": (meta.get("pipeline") or {}).get("vad", {}).get("type"),
            "git": meta.get("git"),
            "normalizer": NORMALIZER,
        }
    }
    details: dict = {}
    captions = load_captions(run)

    # --- WER ---------------------------------------------------------------
    wer: dict = {}
    ref_path = _find_file(run, "reference.txt")
    if ref_path is not None:
        ref = load_reference_txt(ref_path, run)
        wer["reference"] = wer_block(ref, hypothesis_text(run, ref.segments))
    captions_ref = caption_reference(captions, run) if captions else None
    if captions_ref is not None:
        wer["captions"] = wer_block(captions_ref, hypothesis_text(run, run.segments))
    wer["primary"] = (
        "reference" if "reference" in wer else "captions" if "captions" in wer else None
    )
    metrics["wer"] = wer

    score_vad(run, captions, per10, metrics, details)

    # --- Chunks --------------------------------------------------------------
    chunks = [e for e in run.events if e["type"] == "chunk"]
    drops = [e for e in run.events if e["type"] == "chunk_drop"]
    hist = {}
    for lo, hi in zip(CHUNK_BINS, CHUNK_BINS[1:] + [None]):
        label = f"{lo}-{hi}s" if hi else f"{lo}s+"
        hist[label] = sum(
            1 for c in chunks if c["duration"] >= lo and (hi is None or c["duration"] < hi)
        )
    reasons: dict[str, int] = {}
    for c in chunks + drops:
        reasons[c["reason"]] = reasons.get(c["reason"], 0) + 1
    metrics["chunks"] = {
        "count": len(chunks),
        "median_s": _median(c["duration"] for c in chunks),
        "mean_s": round(sum(c["duration"] for c in chunks) / len(chunks), 2) if chunks else None,
        "reasons": reasons,
        "histogram": hist,
    }

    # --- Latency and compute -------------------------------------------------
    inferences = [e for e in run.events if e["type"] == "inference"]
    partials = [e for e in run.events if e["type"] == "partial"]
    chunk_by_seq = {c["seq"]: c for c in chunks}
    tail = [
        e["t"] - chunk_by_seq[e["seq"]]["audio_end"]
        for e in inferences
        if e.get("seq") in chunk_by_seq and chunk_by_seq[e["seq"]].get("audio_end") is not None
    ]
    final_s = sum(e.get("infer_ms") or 0 for e in inferences) / 1000
    partial_s = sum(e.get("infer_ms") or 0 for e in partials) / 1000
    metrics["latency"] = {
        "final_infer_ms_median": _median(e["infer_ms"] for e in inferences if e.get("infer_ms")),
        "final_infer_ms_p90": _p90(e["infer_ms"] for e in inferences if e.get("infer_ms")),
        "speech_end_to_final_s_median": _median(tail),
        "speech_end_to_final_s_p90": _p90(tail),
    }
    metrics["compute"] = {
        "final_inference_s": round(final_s, 1),
        "partial_inference_s": round(partial_s, 1),
        "partial_count": len(partials),
        "partial_infer_ms_median": _median(e["infer_ms"] for e in partials if e.get("infer_ms")),
        "partial_share_pct": _pct(partial_s, final_s + partial_s),
        "inference_realtime_factor": round((final_s + partial_s) / window, 3) if window else None,
    }

    # --- Detection -----------------------------------------------------------
    exp_path = _find_file(run, "expected_refs.json")
    expected: list[Expected] = []
    exp_source = None
    if exp_path is not None:
        expected = [x for x in expected_from_json(exp_path) if run.covers(x.t)]
        exp_source = f"expected_refs.json ({exp_path})"
    elif captions is not None:
        expected = expected_played(captions, run)
        exp_source = f"reference parser over {captions.kind} captions"
    preds = predictions(run)
    det = detection(expected, preds, window)
    det["expected_source"] = exp_source
    if exp_source is None:
        # Nothing to score suggestions against: precision is unknown, not 0.
        det["precision"] = det["precision_top1"] = None
    metrics["detection"] = det
    details["expected"] = [
        {
            "ref": x.ref.reference,
            "t": x.t,
            "kind": x.ref.kind,
            "hit_t": x.hit_t,
            "latency_s": round(x.hit_t - x.t, 2) if x.hit_t is not None else None,
            "stage": x.hit_stage,
        }
        for x in expected
    ]
    details["predictions"] = [
        {
            "t": p.t,
            "ref": f"{p.book} {p.chapter}:{p.verse}",
            "stage": p.stage,
            "confidence": p.confidence,
            "rank": p.rank,
            "matched": p.matched,
        }
        for p in preds
    ]
    if captions is not None and captions_ref is not None:
        metrics["wer"]["ref_spans"] = ref_span_wer(captions_ref, captions, run, expected)

    metrics["headline"] = headline(metrics)
    return metrics, details


def headline(m: dict) -> dict:
    wer = m.get("wer", {})
    primary = wer.get(wer.get("primary") or "", {}) if wer.get("primary") else {}
    det = m.get("detection", {})
    eng = m["run"]["engine"]
    return {
        "wer": primary.get("wer"),
        "wer_source": primary.get("source"),
        "ref_span_wer": wer.get("ref_spans", {}).get("wer"),
        "vad_recall_pct": m.get("vad", {}).get("recall"),
        "vad_false_open_s": m.get("vad", {}).get("false_open_s"),
        "hallucinations_per_10min": m.get("hallucinations", {}).get("per_10min"),
        "refs_expected": det.get("expected"),
        "refs_precision_pct": det.get("precision"),
        "refs_recall_pct": det.get("recall"),
        "spoken_to_suggestion_median_s": det.get("latency_median_s"),
        "engine": "{}/{}/{}-{}".format(
            eng.get("backend"), eng.get("model"), eng.get("device"), eng.get("compute_type")
        ),
    }


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------


def _fmt(value, suffix: str = "") -> str:
    if value is None:
        return "—"
    return f"{value}{suffix}"


def render_report(metrics: dict, details: dict) -> str:
    r, h = metrics["run"], metrics["headline"]
    wer = metrics.get("wer", {})
    lines = [
        f"# Live-feed run: {r.get('label') or r.get('title')}",
        "",
        f"- Source: {r.get('title')} — {r.get('source')}",
        f"- Window: {r['window'][0]:.0f}–{r['window'][1]:.0f} s ({r['duration_s']} s) at speed "
        f"{r.get('speed')}"
        + (
            ""
            if r.get("speed") in (1, 1.0, None)
            else " — **latency figures invalid (speed ≠ 1.0)**"
        ),
        *(
            [
                f"- Seeked {r['seeks']}×: only the played stretches are scored ("
                + ", ".join(f"{a:.0f}–{b:.0f} s" for a, b in r.get("played") or [])
                + ")"
            ]
            if r.get("seeks")
            else []
        ),
        f"- Engine: {h['engine']} · VAD: {r.get('vad')} · captions: {r.get('captions')}",
        f"- Git: {(r.get('git') or {}).get('branch')} @ {(r.get('git') or {}).get('commit')}"
        + (" (dirty)" if (r.get("git") or {}).get("dirty") else ""),
    ]
    if r.get("overrides"):
        lines.append(f"- Overrides: `{json.dumps(r['overrides'])}`")
    lines += [
        "",
        "## Headline",
        "",
        "| WER | ref-span WER | VAD recall | VAD false-open | halluc./10 min | refs P / R | "
        "spoken→suggestion (median) |",
        "|---|---|---|---|---|---|---|",
        f"| {_fmt(h['wer'])} ({h.get('wer_source')}) | {_fmt(h['ref_span_wer'])} | "
        f"{_fmt(h['vad_recall_pct'], '%')} "
        f"| {_fmt(h['vad_false_open_s'], ' s')} | {_fmt(h['hallucinations_per_10min'])} "
        f"| {_fmt(h['refs_precision_pct'], '%')} / {_fmt(h['refs_recall_pct'], '%')} "
        f"(n={h['refs_expected']}) "
        f"| {_fmt(h['spoken_to_suggestion_median_s'], ' s')} |",
        "",
        "## WER",
        "",
    ]
    for key in ("reference", "captions"):
        if key in wer:
            w = wer[key]
            lines.append(
                f"- **{w['source']}** — {w['label']}: WER {_fmt(w.get('wer'))} "
                f"(S {w.get('substitutions')}, D {w.get('deletions')}, I {w.get('insertions')}; "
                f"{w['ref_words']} ref words, {w['hyp_words']} hyp words; window {w['window']})"
            )
    if "ref_spans" in wer:
        s = wer["ref_spans"]
        lines.append(
            f"- **Reference spans** (book names + numbers around {s.get('spans')} spoken "
            f"references): "
            f"WER {_fmt(s.get('wer'))} over {s.get('ref_words')} words"
        )
    lines.append(f"- Normalizer: {r.get('normalizer')}")
    v = metrics.get("vad", {})
    lines += [
        "",
        "## VAD and gating",
        "",
        "| metric | value |",
        "|---|---|",
    ]
    labels = {
        "caption_speech_s": "caption speech (s)",
        "recall": "VAD recall: caption speech that reached Whisper (%)",
        "recall_vad_only": "… covered by VAD alone (%)",
        "recall_gate": "… passed VAD + worship gate (%)",
        "speech_lost_to_stale_drop_s": "caption speech lost to stale-drop (s)",
        "false_open_s": "VAD false-open: forwarded with no caption speech (s)",
        "false_open_s_per_10min": "false-open per 10 min (s)",
        "vad_open_s": "VAD open (s)",
        "forwarded_s": "forwarded (s)",
        "reached_whisper_s": "reached Whisper incl. pre-roll (s)",
        "stale_dropped_s": "stale-dropped (s)",
        "trimmed_s": "trimmed (s)",
        "worship_s": "scene = WORSHIP (s)",
    }
    for k, label in labels.items():
        if k in v:
            lines.append(f"| {label} | {_fmt(v[k])} |")
    if "worship_gate" in metrics:
        wg = metrics["worship_gate"]
        lines += [
            "",
            f"**Worship gate (F):** {wg['blocked_speech_s']} s of caption speech that VAD heard "
            f"was blocked "
            f"because the scene was WORSHIP ({_fmt(wg['blocked_pct_of_speech'], '%')} of "
            f"caption speech); "
            f"{wg['caption_speech_in_worship_s']} s of caption speech fell in WORSHIP overall.",
        ]
    if "hallucinations" in metrics:
        hm = metrics["hallucinations"]
        lines += [
            "",
            "## Hallucinations",
            "",
            f"{hm['count']} finals ({hm['per_10min']} per 10 min, {hm['words']} words) were "
            f"emitted where captions "
            f"show no speech; {hm['during_music']} during music.",
            "",
        ]
        for item in details.get("hallucinations", [])[:25]:
            lines.append(
                f"- {item['t']:.1f}s “{item['text']}” (chunk {item['chunk_s']} s, "
                f"no_speech {item['no_speech_prob']}, logprob {item['avg_logprob']}"
                + (", music" if item["during_music"] else "")
                + ")"
            )
    c = metrics["chunks"]
    lines += [
        "",
        "## Chunks sent to Whisper",
        "",
        f"{c['count']} chunks, median {c['median_s']} s, mean {c['mean_s']} s. Cut/drop reasons: "
        + ", ".join(f"{k} {n}" for k, n in sorted(c["reasons"].items())),
        "",
        "| " + " | ".join(c["histogram"]) + " |",
        "|" + "---|" * len(c["histogram"]),
        "| " + " | ".join(str(n) for n in c["histogram"].values()) + " |",
    ]
    lat, comp = metrics["latency"], metrics["compute"]
    lines += [
        "",
        "## Latency and compute",
        "",
        f"- Final inference: median {_fmt(lat['final_infer_ms_median'])} ms, p90 "
        f"{_fmt(lat['final_infer_ms_p90'])} ms",
        f"- End of chunk audio → final emitted: median "
        f"{_fmt(lat['speech_end_to_final_s_median'])} s, "
        f"p90 {_fmt(lat['speech_end_to_final_s_p90'])} s",
        f"- Inference time: finals {comp['final_inference_s']} s, partials "
        f"{comp['partial_inference_s']} s "
        f"({comp['partial_count']} passes, {_fmt(comp['partial_share_pct'], '%')} of all "
        f"inference); "
        f"realtime factor {comp['inference_realtime_factor']}",
    ]
    d = metrics["detection"]
    lines += [
        "",
        "## Scripture detection",
        "",
        f"Expected references: {d['expected']} (from {d.get('expected_source')}). "
        f"Found {d['found']} → recall {_fmt(d['recall'], '%')}. "
        f"{d['suggestions']} distinct suggestions ({d['suggestions_per_10min']} per 10 min), "
        f"precision "
        f"{_fmt(d['precision'], '%')} (top-1 only: {_fmt(d['precision_top1'], '%')}). "
        f"Spoken → suggestion: median {_fmt(d['latency_median_s'], ' s')}, mean "
        f"{_fmt(d['latency_mean_s'], ' s')}. "
        "By stage (suggestions / matched / precision / expected refs found first): "
        + ", ".join(
            f"stage {k}: {v['suggestions']} / {v['matched']} / "
            f"{_fmt(v['precision'], '%')} / {v['found']}"
            for k, v in sorted(d.get("by_stage", {}).items())
        )
        + ".",
        "",
        "Precision counts every distinct suggestion against explicitly spoken references only, so "
        "allusion matches from stages 2–4 count as misses even when they are reasonable.",
        "",
        "| spoken at | expected | via | suggested at | latency | stage |",
        "|---|---|---|---|---|---|",
    ]
    for x in details.get("expected", []):
        lines.append(
            f"| {x['t']:.1f} | {x['ref']} | {x['kind']} | {_fmt(x['hit_t'])} | "
            f"{_fmt(x['latency_s'], ' s')} "
            f"| {_fmt(x['stage'])} |"
        )
    return "\n".join(lines) + "\n"


def score_run_dir(run_dir: str | Path) -> Path:
    run = load_run(run_dir)
    metrics, details = score_run(run)
    out = Path(run_dir)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (out / "details.json").write_text(json.dumps(details, indent=2))
    report = out / "report.md"
    report.write_text(render_report(metrics, details))
    return report
