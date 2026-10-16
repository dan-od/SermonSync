"""Run scorer + caption parsing (SS-072), on a synthetic recorded run."""

from __future__ import annotations

import json

import pytest

jiwer = pytest.importorskip("jiwer")

from engine.eval import captions as cap  # noqa: E402
from engine.eval import scoring  # noqa: E402

HUMAN_VTT = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:04.000
Turn with me to John chapter three verse sixteen

00:00:04.000 --> 00:00:08.000
For God so loved the world

00:00:12.000 --> 00:00:14.000
[Music]
"""

AUTO_VTT = """WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:03.000 align:start position:0%
\x20
turn<00:00:01.400><c> with</c><00:00:01.700><c> me</c><00:00:02.000><c> to</c>

00:00:03.000 --> 00:00:03.010 align:start position:0%
turn with me to


00:00:03.010 --> 00:00:05.000 align:start position:0%
turn with me to
romans<00:00:03.500><c> 8</c><00:00:04.000><c> 28</c>

00:00:05.000 --> 00:00:07.000 align:start position:0%
[Music]
"""


def _ev(kind, t, **fields):
    return {"type": kind, "t": t, "rt": t, **fields}


def _write_run(tmp_path, vtt=HUMAN_VTT, kind="human", extra_events=()):
    run = tmp_path / "run"
    run.mkdir()
    (run / "captions.vtt").write_text(vtt)
    meta = {
        "request": {
            "source": "x", "start": 0.0, "duration": 20.0, "speed": 1.0, "label": "synthetic",
        },
        "source": {"title": "Synthetic", "captions_kind": kind, "source_id": "synthetic"},
        "captions_file": "captions.vtt",
        "engine": {"loaded_model": "base", "device": "cpu", "compute_type": "int8"},
        "pipeline": {"vad": {"type": "SileroVAD"}},
    }
    (run / "meta.json").write_text(json.dumps(meta))
    events = [
        _ev("run_start", 0.0, meta=meta),
        _ev("frame_state", 0.0, is_speech=False, scene="speech", forward=False),
        _ev("frame_state", 0.5, is_speech=True, scene="speech", forward=True),
        _ev("chunk", 4.5, seq=1, reason="pause", duration=3.9, intervals=[[0.3, 4.2]],
            audio_start=0.3, audio_end=4.2),
        _ev("inference", 5.0, seq=1, infer_ms=400.0, latency_ms=900, duration=3.9, segments=[
            {"text": "Turn with me to John chapter 3 verse 16", "no_speech_prob": 0.01,
             "avg_logprob": -0.2}]),
        _ev("ws", 6.0, event={"type": "suggestions", "sentence": "…", "results": [
            {"reference": "John 3:16", "book": "John", "chapter": 3, "verse": 16,
             "stage": 0, "confidence": 0.95},
            {"reference": "Psalms 1:1", "book": "Psalms", "chapter": 1, "verse": 1,
             "stage": 4, "confidence": 0.4},
        ]}),
        _ev("chunk", 8.2, seq=2, reason="ceiling", duration=3.8, intervals=[[4.2, 8.0]],
            audio_start=4.2, audio_end=8.0),
        _ev("frame_state", 8.0, is_speech=False, scene="speech", forward=False),
        _ev("inference", 9.0, seq=2, infer_ms=300.0, latency_ms=900, duration=3.8, segments=[
            {"text": "For God so loved the world.", "no_speech_prob": 0.02, "avg_logprob": -0.3}]),
        _ev("chunk_drop", 9.6, reason="stale_drop", duration=0.5, intervals=[[9.0, 9.5]]),
        _ev("frame_state", 12.0, is_speech=True, scene="speech", forward=True),
        _ev("frame_state", 14.0, is_speech=False, scene="speech", forward=False),
        _ev("chunk", 14.5, seq=3, reason="pause", duration=2.0, intervals=[[12.0, 14.0]],
            audio_start=12.0, audio_end=14.0),
        _ev("inference", 15.0, seq=3, infer_ms=200.0, latency_ms=900, duration=2.0, segments=[
            {"text": "Thank you.", "no_speech_prob": 0.7, "avg_logprob": -1.2}]),
        _ev("partial", 3.0, text="Turn with me", infer_ms=100.0, duration=2.0),
        *extra_events,
        _ev("run_end", 25.0, frames=1000),
    ]
    (run / "events.jsonl").write_text("\n".join(json.dumps(e) for e in events) + "\n")
    return run


def test_parse_human_vtt():
    path_text = HUMAN_VTT
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "c.vtt"
        p.write_text(path_text)
        c = cap.parse_vtt(p)
    assert c.kind == "human"
    assert [s.text for s in c.segments][0].startswith("Turn with me")
    assert c.music_intervals == [(12.0, 14.0)]
    words = c.words
    assert words[0].t == 0.0 and words[-1].text == "world"


def test_parse_auto_vtt_keeps_only_timed_words(tmp_path):
    p = tmp_path / "auto.vtt"
    p.write_text(AUTO_VTT)
    c = cap.parse_vtt(p)
    assert c.kind == "auto"
    assert [w.text for w in c.words] == ["turn", "with", "me", "to", "romans", "8", "28"]
    assert [w.t for w in c.words][:2] == [1.0, 1.4]
    assert c.words[4].t == 3.01
    assert (5.0, 7.0) in c.music_intervals
    spans = c.speech_intervals()
    assert spans[0][0] == 1.0


def test_interval_helpers():
    assert scoring.merge([[3, 4], [1, 2], [1.5, 3.5]]) == [[1, 4]]
    assert scoring.intersect([[0, 5]], [[1, 2], [4, 6]]) == [[1, 2], [4, 5]]
    assert scoring.subtract([[0, 5]], [[1, 2]]) == [[0, 1], [2, 5]]
    assert scoring.total([[0, 1], [2, 4]]) == 3


def test_score_synthetic_run(tmp_path):
    run_dir = _write_run(tmp_path)
    report = scoring.score_run_dir(run_dir)
    m = json.loads((run_dir / "metrics.json").read_text())

    assert report.exists()
    assert m["wer"]["primary"] == "captions"
    # Perfect transcript except the hallucinated "Thank you." (2 insertions / 15).
    assert m["wer"]["captions"]["wer"] == pytest.approx(2 / 15, abs=1e-3)
    assert m["wer"]["captions"]["insertions"] == 2
    assert m["wer"]["captions"]["label"] == "accuracy vs human captions"
    # Speech 0–7.73 s; Whisper got 0.3–8 s.
    assert m["vad"]["recall"] == pytest.approx(96.1, abs=0.5)
    # The 12–14 s burst was forwarded with no caption speech (music).
    assert m["vad"]["false_open_s"] == pytest.approx(2.0, abs=0.1)
    assert m["vad"]["stale_dropped_s"] == 0.5
    assert m["hallucinations"]["count"] == 1
    assert m["hallucinations"]["during_music"] == 1
    det = m["detection"]
    assert det["expected"] == 1 and det["found"] == 1
    assert det["recall"] == 100.0
    assert det["precision"] == 50.0
    assert det["precision_top1"] == 100.0
    assert det["latency_median_s"] == pytest.approx(2.44, abs=0.1)
    assert m["chunks"]["reasons"] == {"pause": 2, "ceiling": 1, "stale_drop": 1}
    assert m["chunks"]["histogram"]["3-4s"] == 2
    assert m["compute"]["partial_count"] == 1
    assert m["wer"]["ref_spans"]["wer"] == 0.0
    assert "agreement with YouTube ASR" not in report.read_text()


def test_auto_captions_are_labelled_agreement(tmp_path):
    run_dir = _write_run(tmp_path, vtt=AUTO_VTT, kind="auto")
    scoring.score_run_dir(run_dir)
    m = json.loads((run_dir / "metrics.json").read_text())
    assert "agreement with YouTube ASR" in m["wer"]["captions"]["label"]
    assert m["detection"]["expected"] == 1  # "romans 8 28"


def test_reference_txt_takes_priority_with_window(tmp_path):
    run_dir = _write_run(tmp_path)
    (run_dir / "reference.txt").write_text(
        "# window: 4-9\nFor God so loved the whole world\n"
    )
    scoring.score_run_dir(run_dir)
    m = json.loads((run_dir / "metrics.json").read_text())
    assert m["wer"]["primary"] == "reference"
    ref = m["wer"]["reference"]
    assert ref["window"] == [4.0, 9.0]
    assert ref["deletions"] == 1 and ref["substitutions"] == 0
    assert m["headline"]["wer_source"] == "reference.txt"


def test_expected_refs_json_overrides_parser(tmp_path):
    run_dir = _write_run(tmp_path)
    (run_dir / "expected_refs.json").write_text(json.dumps([
        {"ref": "John 3:16", "t": 3.5}, {"ref": "Romans 8:28-30", "t": 10.0},
    ]))
    scoring.score_run_dir(run_dir)
    det = json.loads((run_dir / "metrics.json").read_text())["detection"]
    assert det["expected"] == 2 and det["found"] == 1
    assert det["recall"] == 50.0


def test_duplicate_suggestions_collapse(tmp_path):
    again = _ev("ws", 10.0, event={"type": "suggestions", "results": [
        {"book": "John", "chapter": 3, "verse": 16, "stage": 2, "confidence": 0.9}]})
    run_dir = _write_run(tmp_path, extra_events=[again])
    scoring.score_run_dir(run_dir)
    det = json.loads((run_dir / "metrics.json").read_text())["detection"]
    assert det["suggestions"] == 2


def test_compare_runs(tmp_path):
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "compare_runs", Path(scoring.SIDECAR_DIR) / "scripts" / "compare_runs.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    a = {"run": {"dir": "a"}, "headline": {"wer": 0.3, "refs_recall_pct": 50.0}}
    b = {"run": {"dir": "b"}, "headline": {"wer": 0.2, "refs_recall_pct": 40.0}}
    rows = {r[0]: r for r in mod.compare(a, b)}
    assert rows["WER"][3].endswith("✓")
    assert rows["refs recall %"][3].endswith("✗")
