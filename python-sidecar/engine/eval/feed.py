"""Test-feed controller for the live-feed harness (SS-072).

Owns one evaluation run at a time: resolves the source, stops the microphone,
resets per-stream state, starts the transcriber if needed, wires the run
recorder into the eval tap and WS hub, streams the file through the capture
pipeline, then drains the tail of the pipeline and (when the dev scoring
dependencies are installed) writes the run's report.

Dev-only: the HTTP routes that drive it are mounted only when
SERMONSYNC_DEV_FEED=1 (see api/test_feed.py).
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

from ws_hub import manager

from ..audio import file_source as fs
from . import tap
from .recorder import RunRecorder

logger = logging.getLogger("sermonsync.eval.feed")

RUNS_DIR = Path(os.environ.get("SERMONSYNC_EVAL_RUNS", fs.SIDECAR_DIR / "eval_runs"))
ENV_FLAG = "SERMONSYNC_DEV_FEED"
# Longest we wait after the audio ends for the last chunk, its inference and
# the matcher to finish, so trailing suggestions land in the run.
DRAIN_TIMEOUT_SECONDS = 20.0


def dev_feed_enabled() -> bool:
    return os.environ.get(ENV_FLAG) == "1"


class FeedBusyError(RuntimeError):
    pass


def _git_info() -> dict:
    def run(*args: str) -> str | None:
        try:
            return subprocess.run(
                ["git", *args],
                cwd=fs.SIDECAR_DIR,
                capture_output=True,
                text=True,
                timeout=5,
                check=True,
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return None

    return {
        "branch": run("rev-parse", "--abbrev-ref", "HEAD"),
        "commit": run("rev-parse", "--short", "HEAD"),
        "dirty": bool(run("status", "--porcelain", "--untracked-files=no")),
    }


def _override_targets() -> dict:
    """Objects whose attributes a run may override (dev sweeps)."""
    from ..audio import vad, worship_detector
    from ..audio.capture import capture_manager
    from ..transcription import whisper_engine
    from ..transcription.streaming import streaming_transcriber

    targets = {
        "capture": capture_manager,
        "streaming": streaming_transcriber,
        "vad": vad.get_detector(),
        "worship": worship_detector.get_detector(),
        "whisper": whisper_engine.get_engine(),
    }
    return targets


def apply_overrides(overrides: dict) -> list[tuple[object, str, object]]:
    """Apply {"target.attr": value}; returns the undo list. Unknown keys raise."""
    targets = _override_targets()
    undo: list[tuple[object, str, object]] = []
    try:
        for key, value in (overrides or {}).items():
            target_name, _, attr = key.partition(".")
            target = targets.get(target_name)
            if target is None or not attr or not hasattr(target, attr):
                raise ValueError(f"unknown override {key!r}")
            undo.append((target, attr, getattr(target, attr)))
            setattr(target, attr, value)
    except Exception:
        restore_overrides(undo)
        raise
    return undo


def restore_overrides(undo: list[tuple[object, str, object]]) -> None:
    for target, attr, value in reversed(undo):
        setattr(target, attr, value)


def _pipeline_config() -> dict:
    from ..audio import vad, worship_detector
    from ..audio.capture import capture_manager
    from ..transcription.streaming import streaming_transcriber

    detector = vad.get_detector()
    st = streaming_transcriber
    return {
        "vad": {
            "type": type(detector).__name__,
            **{
                k: getattr(detector, k)
                for k in (
                    "threshold",
                    "sensitivity",
                    "hangover_frames",
                    "hangover_ms",
                    "preroll_ms",
                )
                if hasattr(detector, k)
            },
        },
        "capture": {
            k: getattr(capture_manager, k) for k in ("preroll_ms", "resampler")
            if hasattr(capture_manager, k)
        },
        "worship": {
            k: getattr(worship_detector.get_detector(), k)
            for k in ("window_frames", "switch_frames", "flatness_music_max")
        },
        "streaming": {
            k: getattr(st, k)
            for k in (
                "max_chunk_seconds",
                "max_buffer_seconds",
                "min_flush_seconds",
                "silence_flush_seconds",
                "partial_interval",
                "partial_min_seconds",
                "partial_max_seconds",
                "partials_enabled",
                "partial_model",
                "language",
            )
            if hasattr(st, k)
        },
    }


class FeedController:
    def __init__(self) -> None:
        self.state = "idle"  # idle | loading | playing | draining | stopped | error
        self.title: str | None = None
        self.error: str | None = None
        self.run_dir: Path | None = None
        self.report_path: str | None = None
        self.request: dict = {}
        self._source: fs.FileAudioSource | None = None
        self._prepared: fs.PreparedSource | None = None
        self._task: asyncio.Task | None = None
        self._end_wall: float | None = None
        self._end_position: float | None = None
        self.warm_matcher = True

    # ------------------------------------------------------------------
    @property
    def active(self) -> bool:
        return self.state in ("loading", "playing", "draining")

    def position(self) -> float:
        """Source seconds heard so far. After the audio ends it keeps advancing
        with the wall clock, as if silence followed, so events raised while the
        pipeline drains are stamped with honest latencies."""
        if self._source is None:
            return float(self.request.get("start") or 0.0)
        if self._end_wall is not None and self._end_position is not None:
            speed = self._source.speed
            return self._end_position + (time.time() - self._end_wall) * speed
        return self._source.position

    def status(self) -> dict:
        src = self._source
        start = float(self.request.get("start") or 0.0)
        duration = self.request.get("duration")
        return {
            "type": "test_feed",
            "state": self.state,
            "title": self.title,
            "source": self.request.get("source"),
            "position": round(self.position(), 2),
            "start": start,
            "end": start + duration
            if duration
            else (self._prepared.media_duration if self._prepared else None),
            "speed": self.request.get("speed", 1.0),
            "label": self.request.get("label"),
            "captions": self._prepared.captions_kind if self._prepared else None,
            "run_dir": str(self.run_dir) if self.run_dir else None,
            "report": self.report_path,
            "late_frames": src.late_frames if src else 0,
            "error": self.error,
        }

    async def _broadcast(self) -> None:
        await manager.broadcast_json(self.status())

    # ------------------------------------------------------------------
    async def start(
        self,
        source: str,
        start: float = 0.0,
        duration: float | None = None,
        speed: float = 1.0,
        monitor: bool = False,
        sample_rate: int = fs.SAMPLE_RATE,
        label: str | None = None,
        overrides: dict | None = None,
        score: bool = True,
        captions_human: bool = False,
    ) -> dict:
        if self.active:
            raise FeedBusyError("a test feed is already running")
        if speed <= 0:
            raise ValueError("speed must be > 0")
        self.request = {
            "source": source,
            "start": start,
            "duration": duration,
            "speed": speed,
            "monitor": monitor,
            "sample_rate": sample_rate,
            "label": label,
            "overrides": overrides or {},
            "score": score,
            "captions_human": captions_human,
        }
        self.state, self.title, self.error = "loading", None, None
        self.run_dir, self.report_path = None, None
        self._source, self._prepared = None, None
        self._end_wall = self._end_position = None
        self._task = asyncio.create_task(self._run())
        await self._broadcast()
        return self.status()

    async def stop(self) -> dict:
        if self._source is not None:
            self._source.stop()
        elif self._task is not None and self.state == "loading":
            self._task.cancel()
        return self.status()

    async def wait(self) -> None:
        if self._task is not None:
            await asyncio.shield(self._task)

    # ------------------------------------------------------------------
    async def _prepare_pipeline(self) -> None:
        from ..audio import vad, worship_detector
        from ..audio.capture import capture_manager
        from ..context_detector import get_detector as get_context_detector
        from ..matching.orchestrator import get_orchestrator
        from ..transcription.buffer import transcript_buffer
        from ..transcription.streaming import streaming_transcriber

        # The mic and the file must never feed process_frame at the same time.
        await capture_manager.stop()
        if not streaming_transcriber._running:
            await streaming_transcriber.start()
        # Build the matcher indexes now, as a long-running service already has,
        # so the first spoken reference isn't charged for index construction.
        if self.warm_matcher:
            await asyncio.to_thread(
                get_orchestrator().build_payload, "for God so loved the world", None
            )
        vad.get_detector().reset()
        worship_detector.get_detector().reset()
        transcript_buffer.reset()
        get_context_detector().reset()
        streaming_transcriber.reset()
        capture_manager.bind_loop(asyncio.get_running_loop())
        capture_manager.reset_frame_state()

    async def _drain(self) -> None:
        """Let the last chunk be cut, transcribed and matched."""
        from ..transcription.streaming import streaming_transcriber

        deadline = time.time() + DRAIN_TIMEOUT_SECONDS
        # The trailing chunk is cut once the pause timer sees no new audio.
        await asyncio.sleep(streaming_transcriber.silence_flush_seconds + 0.5)
        while time.time() < deadline and streaming_transcriber._buffered_seconds() > 0:
            await asyncio.sleep(0.25)
        # Inference and the fire-and-forget matcher tasks finish after the cut.
        await asyncio.sleep(3.0)

    async def _run(self) -> None:
        from ..audio.capture import capture_manager
        from ..transcription import whisper_engine
        from ..transcription.streaming import streaming_transcriber

        req = self.request
        recorder: RunRecorder | None = None
        undo: list = []
        loop = asyncio.get_running_loop()
        finished = asyncio.Event()
        ticker: asyncio.Task | None = None
        try:
            prepared = await asyncio.to_thread(fs.prepare_source, req["source"])
            self._prepared = prepared
            self.title = prepared.title
            await self._broadcast()
            await self._prepare_pipeline()
            undo = apply_overrides(req["overrides"])

            stamp = time.strftime("%Y%m%d-%H%M%S")
            slug = fs.slugify(req.get("label") or prepared.title, 40)
            self.run_dir = RUNS_DIR / f"{stamp}_{slug}"
            self.run_dir.mkdir(parents=True, exist_ok=True)
            captions_file = None
            if prepared.captions_path:
                captions_file = "captions.vtt"
                shutil.copyfile(prepared.captions_path, self.run_dir / captions_file)

            source = fs.FileAudioSource(
                prepared.audio_path,
                capture_manager.process_frame,
                start=req["start"] or 0.0,
                duration=req["duration"],
                speed=req["speed"],
                monitor=req["monitor"],
                sample_rate=req.get("sample_rate") or fs.SAMPLE_RATE,
                on_finish=lambda reason: loop.call_soon_threadsafe(finished.set),
            )
            self._source = source
            recorder = RunRecorder(
                self.run_dir,
                clock=self.position,
                frame_seconds=source.frame_seconds,
                byte_base=streaming_transcriber.fed_bytes,
            )
            recorder.open(
                {
                    "request": req,
                    "source": prepared.to_dict(),
                    "captions_file": captions_file,
                    "engine": whisper_engine.engine_status(),
                    "decode_options": getattr(whisper_engine.get_engine(), "decode_options", None),
                    "pipeline": _pipeline_config(),
                    "git": _git_info(),
                    "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                }
            )
            tap.install(recorder)
            manager.add_listener(recorder.on_broadcast)

            source.start_thread()
            self.state = "playing"
            await self._broadcast()

            async def tick() -> None:
                while True:
                    await asyncio.sleep(1.0)
                    await self._broadcast()
                    recorder.flush()

            ticker = asyncio.create_task(tick())
            await finished.wait()
            self._end_position = source.position
            self._end_wall = time.time()
            self.state = "draining"
            await self._broadcast()
            await self._drain()
            if source.error:
                self.error = source.error
        except asyncio.CancelledError:
            self.error = "cancelled"
        except Exception as exc:
            logger.exception("test feed failed")
            self.error = str(exc)
        finally:
            if ticker is not None:
                ticker.cancel()
            if self._source is not None:
                self._source.stop()
            if recorder is not None:
                manager.remove_listener(recorder.on_broadcast)
                tap.uninstall(recorder)
                src = self._source
                recorder.close(
                    {
                        "finish_reason": src.finish_reason if src else None,
                        "frames": src.frames_processed if src else 0,
                        "late_frames": src.late_frames if src else 0,
                        "max_lag_seconds": round(src.max_lag_seconds, 3) if src else 0,
                        "error": self.error,
                        "counts": recorder.counts,
                    }
                )
            restore_overrides(undo)
            self.state = "error" if self.error and recorder is None else "stopped"
            await self._broadcast()

        if recorder is not None and req.get("score"):
            await self._score()

    async def _score(self) -> None:
        try:
            from . import scoring
        except ImportError as exc:  # dev scoring deps (jiwer, …) not installed
            logger.info("test feed: skipping scoring (%s)", exc)
            return
        try:
            report = await asyncio.to_thread(scoring.score_run_dir, self.run_dir)
            self.report_path = str(report)
        except Exception:
            logger.exception("test feed: scoring failed")
        await self._broadcast()


test_feed = FeedController()
