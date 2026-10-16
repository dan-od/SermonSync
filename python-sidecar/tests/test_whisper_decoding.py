"""Whisper decoding options, prompts and the hallucination filter (fix C)."""

from __future__ import annotations

import asyncio

import numpy as np
import pytest
from engine.transcription import streaming, whisper_engine
from engine.transcription.streaming import StreamingTranscriber, hallucination_reason


class _Seg:
    def __init__(self, text, nsp=0.01, lp=-0.2):
        self.text, self.start, self.end = text, 0.0, 1.0
        self.no_speech_prob, self.avg_logprob, self.compression_ratio = nsp, lp, 1.2


class _Model:
    def __init__(self):
        self.calls = []

    def transcribe(self, audio, **kwargs):
        self.calls.append(kwargs)
        info = type("Info", (), {"language": "en"})()
        return iter([_Seg("hello")]), info


def test_engine_decode_options_and_hints():
    model = _Model()
    eng = whisper_engine.WhisperEngine("base", "cpu", "int8", model)
    eng.transcribe(np.zeros(1600, dtype="float32"), "en")
    first = model.calls[0]
    assert first["beam_size"] == 1
    assert first["condition_on_previous_text"] is False
    assert "initial_prompt" not in first and "hotwords" not in first
    eng.transcribe(np.zeros(1600, dtype="float32"), "en", prompt="John 3:16", hotwords="Psalm 23")
    assert model.calls[1]["initial_prompt"] == "John 3:16"
    assert model.calls[1]["hotwords"] == "Psalm 23"


@pytest.mark.parametrize(
    "seg, alone, reason",
    [
        ({"text": "Thank you.", "no_speech_prob": 0.1, "avg_logprob": -0.3}, True, "blocklist"),
        ({"text": "Thank you.", "no_speech_prob": 0.1, "avg_logprob": -0.3}, False, None),
        (
            {"text": "Thanks for watching!", "no_speech_prob": 0.0, "avg_logprob": -0.1},
            True,
            "blocklist",
        ),
        (
            {
                "text": "Subtitles by the Amara.org community",
                "no_speech_prob": 0.0,
                "avg_logprob": -0.1,
            },
            True,
            "blocklist",
        ),
        ({"text": "Amen.", "no_speech_prob": 0.1, "avg_logprob": -0.3}, True, None),
        (
            {"text": "and the Lord said", "no_speech_prob": 0.7, "avg_logprob": -1.1},
            False,
            None,  # Whisper's no-speech score alone is not trusted
        ),
        ({"text": "and the Lord said", "no_speech_prob": 0.7, "avg_logprob": -0.3}, False, None),
    ],
)
def test_hallucination_reason(seg, alone, reason):
    assert hallucination_reason(seg, alone) == reason


@pytest.mark.parametrize(
    "text, seconds, reason",
    [
        ("Zoom!", 0.8, "short_chunk"),
        ("Three, one", 1.0, "short_chunk"),
        ("Turn to John three", 1.0, None),
        ("Zoom!", 2.0, None),
    ],
)
def test_short_chunk_rule(text, seconds, reason):
    assert hallucination_reason({"text": text}, True, seconds) == reason


def test_decode_hints_by_mode():
    st = StreamingTranscriber()
    assert st._decode_hints() == {}
    st.prompt_mode = "style"
    assert st._decode_hints() == {"prompt": streaming.STYLE_PROMPT}
    st.prompt_as_hotwords = True
    assert st._decode_hints() == {"hotwords": streaming.STYLE_PROMPT}
    st.prompt_as_hotwords = False
    st.prompt_mode = "final_tail"
    assert st._decode_hints() == {}  # nothing final yet
    st._final_tail = "x" * 500
    assert len(st._decode_hints()["prompt"]) == streaming.FINAL_TAIL_CHARS


def test_style_prompt_is_far_below_whisper_prompt_limit():
    # ~1.3 tokens per word for English; the cap is 224 tokens.
    assert len(streaming.STYLE_PROMPT.split()) * 2 < 224


def test_dropped_segments_are_not_broadcast(monkeypatch):
    sent = []

    async def capture(payload):
        sent.append(payload)

    class Eng:
        def transcribe(self, audio, language=None, **hints):
            return [
                {
                    "text": "Thank you.",
                    "confidence": 0.5,
                    "no_speech_prob": 0.2,
                    "avg_logprob": -0.5,
                    "start": 0,
                    "end": 1,
                }
            ]

    monkeypatch.setattr(streaming.manager, "broadcast_json", capture)
    whisper_engine.set_engine(Eng())
    try:
        st = StreamingTranscriber(matching_enabled=False)
        asyncio.run(st._infer_and_emit(b"\x00\x00" * 16000, 0.0, 1))
    finally:
        whisper_engine.set_engine(None)
    assert not [p for p in sent if p.get("type") == "transcription"]
    assert st._final_tail == ""
