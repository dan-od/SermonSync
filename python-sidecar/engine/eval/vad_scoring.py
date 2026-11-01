"""VAD recall, false-open and hallucination scoring (SS-072)."""

from __future__ import annotations

from .intervals import CAPTION_PAD, _pct, clip, intersect, merge, pad, subtract, total
from .run_data import Run, event_intervals, state_intervals

HALLUCINATION_SPEECH_FRACTION = 0.2


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def score_vad(run: Run, captions, per10, metrics: dict, details: dict) -> None:
    """Fills metrics["vad"], ["worship_gate"] and ["hallucinations"] for a run."""
    # --- VAD / gate / drops ------------------------------------------------
    is_speech = clip(state_intervals(run, "is_speech"), run.start, run.end)
    forwarded = clip(state_intervals(run, "forward"), run.start, run.end)
    worship = clip(state_intervals(run, "scene", "worship"), run.start, run.end)
    reached = clip(event_intervals(run, "chunk"), run.start, run.end)
    stale = clip(event_intervals(run, "chunk_drop", "stale_drop"), run.start, run.end)
    trimmed = clip(event_intervals(run, "chunk_drop", "trim"), run.start, run.end)
    vad: dict = {
        "vad_open_s": round(total(is_speech), 1),
        "forwarded_s": round(total(forwarded), 1),
        "reached_whisper_s": round(total(reached), 1),
        "stale_dropped_s": round(total(stale), 1),
        "trimmed_s": round(total(trimmed), 1),
        "worship_s": round(total(worship), 1),
    }
    speech = []
    if captions is not None:
        speech = captions.speech_intervals(run.start, run.end)
        speech_total = total(speech)
        padded = pad(speech, CAPTION_PAD)
        vad.update(
            {
                "caption_speech_s": round(speech_total, 1),
                "recall": _pct(total(intersect(speech, reached)), speech_total),
                "recall_vad_only": _pct(total(intersect(speech, is_speech)), speech_total),
                "recall_gate": _pct(total(intersect(speech, forwarded)), speech_total),
                "false_open_s": round(total(subtract(forwarded, padded)), 1),
                "false_open_s_per_10min": per10(total(subtract(forwarded, padded))),
                "speech_lost_to_stale_drop_s": round(total(intersect(speech, stale)), 1),
            }
        )
        # F: caption speech the worship gate blocked although VAD heard speech.
        metrics["worship_gate"] = {
            "caption_speech_in_worship_s": round(total(intersect(speech, worship)), 1),
            "blocked_speech_s": round(total(intersect(intersect(speech, is_speech), worship)), 1),
            "blocked_pct_of_speech": _pct(
                total(intersect(intersect(speech, is_speech), worship)), speech_total
            ),
        }
    metrics["vad"] = vad

    # --- Hallucinations ----------------------------------------------------
    if captions is not None:
        padded = pad(speech, CAPTION_PAD)
        music = merge(captions.music_intervals)
        halluc = []
        for f in run.finals:
            if not (run.start <= f.midpoint < run.end) or not f.intervals:
                continue
            dur = total(f.intervals)
            overlap = total(intersect(f.intervals, padded))
            if overlap < HALLUCINATION_SPEECH_FRACTION * dur:
                halluc.append(
                    {
                        "t": f.t,
                        "text": f.text,
                        "chunk_s": round(dur, 2),
                        "speech_overlap_s": round(overlap, 2),
                        "during_music": total(intersect(f.intervals, music)) > 0,
                        "no_speech_prob": f.no_speech_prob,
                        "avg_logprob": f.avg_logprob,
                    }
                )
        metrics["hallucinations"] = {
            "count": len(halluc),
            "per_10min": per10(len(halluc)),
            "during_music": sum(h["during_music"] for h in halluc),
            "words": sum(len(h["text"].split()) for h in halluc),
        }
        details["hallucinations"] = halluc
