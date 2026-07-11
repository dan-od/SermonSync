"""Unit tests for sermon theme detection (SS-022)."""

from __future__ import annotations

from engine.context_detector import ContextDetector


def test_detect_salvation_theme():
    d = ContextDetector()
    res = d.detect("Christ came to save us; through his blood we have redemption")
    assert "DIVINE SALVATION" in res["themes"]
    assert res["confidence"] > 0.5


def test_detect_multiple_themes_ranked():
    d = ContextDetector()
    res = d.detect(
        "we have eternal hope and everlasting life in heaven, and by faith we believe"
    )
    assert "ETERNAL HOPE" in res["themes"]
    assert "FAITH & WORKS" in res["themes"]
    assert len(res["themes"]) <= 3


def test_no_theme_for_neutral_text():
    d = ContextDetector()
    res = d.detect("the meeting starts at nine tomorrow morning")
    assert res["themes"] == []
    assert res["confidence"] == 0.0


def test_periodic_update_cadence():
    d = ContextDetector(update_every=5)
    payloads = []
    # First salvation sentence triggers a shift update immediately.
    for i in range(1, 7):
        p = d.feed("grace and mercy and forgiveness")
        if p:
            payloads.append((i, p))
    # An update at the first themed sentence (shift) and at the 5th (cadence).
    assert payloads
    assert payloads[0][1]["type"] == "context_update"
    assert "JUDGEMENT & MERCY" in payloads[0][1]["themes"] or \
        "LOVE & GRACE" in payloads[0][1]["themes"]


def test_topic_shift_triggers_update():
    # window=1 so each sentence is judged on its own (no context blending).
    d = ContextDetector(update_every=100, window=1)  # cadence effectively off
    first = d.feed("salvation through the cross and the atonement blood")
    assert first is not None  # initial theme established
    assert first["themes"][0] == "DIVINE SALVATION"
    # Same theme again -> no new update
    assert d.feed("saved by the saviour and the gospel") is None
    # Clear primary-theme shift -> update
    shift = d.feed("pray and worship and give praise and thanksgiving")
    assert shift is not None
    assert shift["themes"][0] == "PRAYER & WORSHIP"
