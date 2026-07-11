"""Unit tests for transcript buffering / sentence assembly (SS-016)."""

from __future__ import annotations

from engine.transcription.buffer import TranscriptBuffer


def test_single_sentence_emitted_on_punctuation():
    buf = TranscriptBuffer()
    out = buf.add_fragment("For God so loved the world.", timestamp=1.0)
    assert len(out) == 1
    assert out[0]["text"] == "For God so loved the world."
    assert out[0]["type"] == "sentence"
    assert out[0]["context"] == []


def test_incomplete_fragment_held_until_terminated():
    buf = TranscriptBuffer()
    assert buf.add_fragment("The Lord is", timestamp=1.0) == []
    out = buf.add_fragment("my shepherd.", timestamp=1.2)
    assert len(out) == 1
    assert out[0]["text"] == "The Lord is my shepherd."


def test_multiple_sentences_in_one_fragment():
    buf = TranscriptBuffer()
    out = buf.add_fragment("Rejoice always. Pray without ceasing! Give thanks;", timestamp=1.0)
    assert [o["text"] for o in out] == [
        "Rejoice always.",
        "Pray without ceasing!",
        "Give thanks;",
    ]


def test_context_window_rolls_and_precedes():
    buf = TranscriptBuffer(context_size=2)
    buf.add_fragment("One.", timestamp=1.0)
    buf.add_fragment("Two.", timestamp=2.0)
    out = buf.add_fragment("Three.", timestamp=3.0)
    # context for "Three." should be the two prior sentences.
    assert out[0]["context"] == ["One.", "Two."]
    # window is capped at 2
    assert buf.get_context() == ["Two.", "Three."]


def test_partial_then_final():
    buf = TranscriptBuffer()
    assert buf.add_fragment("Blessed are the", is_final=False, timestamp=1.0) == []
    assert buf.partial == "Blessed are the"
    out = buf.add_fragment("Blessed are the meek.", is_final=True, timestamp=1.5)
    assert len(out) == 1
    assert out[0]["text"] == "Blessed are the meek."
    assert buf.partial == ""


def test_silence_gap_flushes_unterminated():
    buf = TranscriptBuffer(silence_gap=2.0)
    assert buf.add_fragment("and it came to pass", timestamp=1.0) == []
    # a fragment arriving after a > 2s gap flushes the stalled buffer first
    out = buf.add_fragment("In those days.", timestamp=5.0)
    texts = [o["text"] for o in out]
    assert "and it came to pass" in texts
    assert "In those days." in texts


def test_explicit_flush():
    buf = TranscriptBuffer()
    buf.add_fragment("no terminator here", timestamp=1.0)
    out = buf.flush(timestamp=2.0)
    assert len(out) == 1
    assert out[0]["text"] == "no terminator here"


def test_on_sentence_callback():
    seen = []
    buf = TranscriptBuffer(on_sentence=seen.append)
    buf.add_fragment("Amen.", timestamp=1.0)
    assert len(seen) == 1
    assert seen[0]["text"] == "Amen."
