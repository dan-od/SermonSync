"""End-to-end pipeline integration test (SS-054).

Exercises the real backend chain: synthesized speech -> faster-whisper
transcription -> sentence assembly -> 4-stage scripture matching -> suggestion.
(The final SEND LIVE -> projector output stage is frontend and covered there.)

Skipped automatically when the macOS `say` TTS or the Whisper model aren't
available, so it never breaks portable/headless runs.
"""

from __future__ import annotations

import shutil
import subprocess
import wave

import numpy as np
import pytest

pytestmark = pytest.mark.skipif(
    shutil.which("say") is None, reason="macOS `say` TTS not available"
)


def _synthesize(text: str, path: str) -> None:
    subprocess.run(
        ["say", "-o", path, "--data-format=LEI16@16000", text],
        check=True,
        timeout=30,
    )


def _load_wav_f32(path: str) -> np.ndarray:
    with wave.open(path, "rb") as w:
        pcm = w.readframes(w.getnframes())
    return np.frombuffer(pcm, dtype="<i2").astype("float32") / 32768.0


def test_end_to_end_audio_to_suggestion(tmp_path):
    try:
        from engine.matching.orchestrator import PipelineOrchestrator
        from engine.transcription.buffer import TranscriptBuffer
        from engine.transcription.whisper_engine import WhisperEngine
    except ImportError as exc:  # pragma: no cover
        pytest.skip(f"pipeline deps unavailable: {exc}")

    try:
        engine = WhisperEngine.load(["tiny"])
    except Exception as exc:  # model download blocked / offline
        pytest.skip(f"Whisper model unavailable: {exc}")

    wav = str(tmp_path / "verse.wav")
    _synthesize("For God so loved the world that he gave his only begotten son", wav)

    # 1) audio -> transcription
    segments = engine.transcribe(_load_wav_f32(wav), language="en")
    text = " ".join(s["text"] for s in segments).strip()
    assert text, "transcription produced no text"

    # 2) transcription -> assembled sentence(s)
    buf = TranscriptBuffer()
    sentences = []
    for seg in segments:
        sentences.extend(buf.add_fragment(seg["text"], is_final=True))
    sentences.extend(buf.flush())
    assembled = " ".join(s["text"] for s in sentences) or text

    # 3) sentence -> 4-stage scripture match
    class _Empty:
        def match(self, *a, **k):
            return []

    orch = PipelineOrchestrator(semantic=_Empty())  # skip heavy Stage 4
    results = orch.match(assembled)

    # 4) the correct scripture is surfaced end-to-end
    refs = [r["reference"] for r in results]
    assert "John 3:16" in refs, f"expected John 3:16, got {refs} from {assembled!r}"
    top = results[0]
    assert top["confidence"] > 0.5
