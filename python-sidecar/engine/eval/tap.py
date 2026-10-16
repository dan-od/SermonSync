"""Instrumentation tap for the live-feed evaluation harness (SS-072).

The live pipeline calls `emit(kind, **fields)` at the points the harness needs
to observe (VAD/scene edges, chunks cut for Whisper, partials, finals). With no
recorder installed — always the case in production — `emit` is one global
check and returns, so the hot paths pay nothing. Call sites that would build
an expensive payload guard on `active()` first.

A recorder is any object with `record(kind: str, fields: dict) -> None`. It is
called from whichever thread raised the event (the audio thread for frame
events, the event loop or an inference worker for transcription events), so
recorders must be thread-safe.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("sermonsync.eval.tap")

_recorder = None


def install(recorder) -> None:
    global _recorder
    _recorder = recorder


def uninstall(recorder=None) -> None:
    """Remove the recorder (only if it is `recorder`, when one is given)."""
    global _recorder
    if recorder is None or _recorder is recorder:
        _recorder = None


def active() -> bool:
    return _recorder is not None


def emit(kind: str, **fields) -> None:
    recorder = _recorder
    if recorder is None:
        return
    try:
        recorder.record(kind, fields)
    except Exception:  # never let instrumentation break the pipeline
        logger.exception("eval tap recorder failed on %s", kind)
