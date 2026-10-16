"""File / URL audio source for the live-feed test harness (SS-072).

Feeds recorded audio into `CaptureManager.process_frame` — the same entry
point the PortAudio callback uses — paced to the wall clock, so VAD, worship
detection, pre-roll, Whisper, sentence assembly and the matcher all run exactly
as they do on a live microphone.

* Local paths are decoded directly. URLs are resolved with yt-dlp (bestaudio)
  and cached in `python-sidecar/eval_cache/<id>/` together with the video's
  English captions (human-made preferred, auto-generated as a fallback; which
  one was used is recorded in `meta.json`).
* Audio is decoded with ffmpeg to mono float32 at 48 kHz (channels averaged) — a typical device
  rate, so the resampling step runs just as it would on a real mic — and
  delivered as 20 ms frames.
* `speed` 1.0 is real time. Faster speeds are for quick regression runs only:
  the transcriber's pause detection and stale-buffer timers run on the wall
  clock, so both segmentation and latency differ from a live service.

yt-dlp is a dev dependency (requirements-dev.txt), imported only for URLs.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path

logger = logging.getLogger("sermonsync.audio.file_source")

SIDECAR_DIR = Path(__file__).resolve().parents[2]
# Overridable so several checkouts (fix-branch worktrees) share one cache.
CACHE_DIR = Path(os.environ.get("SERMONSYNC_EVAL_CACHE", SIDECAR_DIR / "eval_cache"))
SAMPLE_RATE = 48000
FRAME_SECONDS = 0.02

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None


def is_url(source: str) -> bool:
    return bool(re.match(r"^https?://", source.strip(), re.IGNORECASE))


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].strip("-") or "source"


@dataclass
class PreparedSource:
    """A decodable audio file plus whatever reference captions came with it."""

    source: str
    source_id: str
    title: str
    audio_path: str
    captions_path: str | None = None
    # "human" | "auto" | "file" (a .vtt next to a local file) | None
    captions_kind: str | None = None
    captions_lang: str | None = None
    url: str | None = None
    channel: str | None = None
    media_duration: float | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def probe_duration(path: str | Path) -> float | None:
    if shutil.which("ffprobe") is None:
        return None
    try:
        out = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=True,
        ).stdout.strip()
        return round(float(out), 3)
    except (subprocess.SubprocessError, ValueError):
        return None


def prepare_source(source: str, cache_dir: Path = CACHE_DIR) -> PreparedSource:
    """Resolve `source` (local path or URL) to a local audio file + captions."""
    if is_url(source):
        return _prepare_url(source.strip(), Path(cache_dir))
    path = Path(source).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"no such audio file: {path}")
    captions = path.with_suffix(".vtt")
    return PreparedSource(
        source=str(path),
        source_id=slugify(path.stem),
        title=path.stem,
        audio_path=str(path),
        captions_path=str(captions) if captions.is_file() else None,
        captions_kind="file" if captions.is_file() else None,
        media_duration=probe_duration(path),
    )


def _english_key(tracks: dict, preferred: tuple[str, ...]) -> str | None:
    for key in preferred:
        if key in tracks:
            return key
    for key in tracks:
        if key == "en" or key.startswith("en-"):
            return key
    return None


def _prepare_url(url: str, cache_dir: Path) -> PreparedSource:
    import yt_dlp

    base_opts = {"quiet": True, "no_warnings": True, "noplaylist": True}
    with yt_dlp.YoutubeDL({**base_opts, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    source_id = slugify(f"{info.get('extractor_key', 'url')}-{info['id']}")
    target = cache_dir / source_id
    target.mkdir(parents=True, exist_ok=True)
    meta_path = target / "meta.json"

    if meta_path.is_file():
        cached = PreparedSource(**json.loads(meta_path.read_text()))
        if Path(cached.audio_path).is_file():
            return cached

    audio = next(iter(sorted(target.glob("audio.*"))), None)
    if audio is None:
        logger.info("downloading audio for %s", url)
        with yt_dlp.YoutubeDL(
            {
                **base_opts,
                "format": "bestaudio/best",
                "outtmpl": str(target / "audio.%(ext)s"),
            }
        ) as ydl:
            ydl.download([url])
        audio = next(iter(sorted(target.glob("audio.*"))), None)
        if audio is None:
            raise RuntimeError(f"yt-dlp produced no audio for {url}")

    # Captions: a human-made English track is a real reference; auto captions
    # are YouTube's own ASR output, so the scorer labels them differently.
    human = _english_key(info.get("subtitles") or {}, ("en", "en-US", "en-GB"))
    auto = _english_key(info.get("automatic_captions") or {}, ("en-orig", "en"))
    kind, lang = ("human", human) if human else ("auto", auto) if auto else (None, None)
    captions_path = None
    if lang:
        for old in target.glob("captions.*"):
            old.unlink()
        with yt_dlp.YoutubeDL(
            {
                **base_opts,
                "skip_download": True,
                "writesubtitles": kind == "human",
                "writeautomaticsub": kind == "auto",
                "subtitleslangs": [lang],
                "subtitlesformat": "vtt",
                "outtmpl": {
                    "default": str(target / "captions"),
                    "subtitle": str(target / "captions"),
                },
            }
        ) as ydl:
            ydl.download([url])
        found = next(iter(sorted(target.glob("captions*.vtt"))), None)
        if found is not None:
            captions_path = str(found)
        else:
            kind, lang = None, None

    prepared = PreparedSource(
        source=url,
        source_id=source_id,
        title=info.get("title") or source_id,
        audio_path=str(audio),
        captions_path=captions_path,
        captions_kind=kind,
        captions_lang=lang,
        url=info.get("webpage_url") or url,
        channel=info.get("channel") or info.get("uploader"),
        media_duration=info.get("duration") or probe_duration(audio),
    )
    meta_path.write_text(json.dumps(prepared.to_dict(), indent=2))
    return prepared


def decode_command(
    path: str,
    start: float = 0.0,
    duration: float | None = None,
    sample_rate: int = SAMPLE_RATE,
) -> list[str]:
    cmd = ["ffmpeg", "-nostdin", "-v", "error"]
    if start > 0:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", str(path)]
    if duration is not None:
        cmd += ["-t", f"{duration:.3f}"]
    # Two channels, averaged to mono in Python the way capture averages a
    # stereo mic. ffmpeg's own "-ac 1" downmix adds +3 dB, which would skew
    # the energy thresholds in VAD and worship detection.
    cmd += ["-vn", "-ac", "2", "-ar", str(sample_rate), "-f", "f32le", "-"]
    return cmd


class FileAudioSource:
    """Streams a decoded file into `process_frame(samples, sample_rate)`.

    Runs on its own thread, like the PortAudio callback. `position` is the
    source time (seconds into the original media) of the start of the frame
    being processed — equivalently, the end of the audio already heard.
    """

    def __init__(
        self,
        audio_path: str,
        process_frame,
        start: float = 0.0,
        duration: float | None = None,
        speed: float = 1.0,
        sample_rate: int = SAMPLE_RATE,
        frame_seconds: float = FRAME_SECONDS,
        monitor: bool = False,
        on_finish=None,
    ) -> None:
        if speed <= 0:
            raise ValueError("speed must be > 0")
        self.audio_path = audio_path
        self.process_frame = process_frame
        self.start = max(0.0, float(start))
        self.duration = duration
        self.speed = float(speed)
        self.sample_rate = sample_rate
        self.frame_samples = round(sample_rate * frame_seconds)
        self.frame_seconds = self.frame_samples / sample_rate
        # Play the audio out loud (real time only), to hear what the pipeline hears.
        self.monitor = monitor and self.speed == 1.0
        self.on_finish = on_finish
        self.frames_processed = 0
        self.late_frames = 0
        self.max_lag_seconds = 0.0
        self.finish_reason: str | None = None
        self.error: str | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._proc: subprocess.Popen | None = None

    @property
    def position(self) -> float:
        return self.start + self.frames_processed * self.frame_seconds

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start_thread(self) -> None:
        if self.is_running:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="file-audio-source", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def join(self, timeout: float | None = None) -> None:
        if self._thread is not None:
            self._thread.join(timeout)

    def frames(self):
        """Yield decoded float32 frames shaped (frame_samples, 1), like PortAudio."""
        if np is None:  # pragma: no cover
            raise RuntimeError("numpy required")
        if shutil.which("ffmpeg") is None:
            raise RuntimeError("ffmpeg not found on PATH")
        frame_bytes = self.frame_samples * 4 * 2
        self._proc = subprocess.Popen(
            decode_command(self.audio_path, self.start, self.duration, self.sample_rate),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout = self._proc.stdout
        try:
            while True:
                data = stdout.read(frame_bytes)
                if not data:
                    break
                if len(data) < frame_bytes:
                    data = data + b"\x00" * (frame_bytes - len(data))
                stereo = np.frombuffer(data, dtype="<f4").reshape(-1, 2)
                yield stereo.mean(axis=1, dtype="float32").reshape(-1, 1)
        finally:
            self._close_proc()

    def _close_proc(self) -> None:
        proc, self._proc = self._proc, None
        if proc is None:
            return
        if proc.poll() is None:
            proc.kill()
        stderr = proc.stderr.read().decode(errors="replace").strip() if proc.stderr else ""
        proc.wait()
        if proc.returncode not in (0, -9) and stderr and self.error is None:
            self.error = stderr.splitlines()[-1]

    def _open_monitor(self):
        if not self.monitor:
            return None
        try:
            import sounddevice as sd

            stream = sd.OutputStream(
                samplerate=self.sample_rate, channels=1, dtype="float32", latency="high"
            )
            stream.start()
            return stream
        except Exception as exc:  # no output device, PortAudio missing, …
            logger.warning("test feed: audio monitor unavailable (%s)", exc)
            return None

    def _run(self) -> None:
        reason = "ended"
        out = self._open_monitor()
        try:
            t0 = time.perf_counter()
            for index, frame in enumerate(self.frames()):
                if self._stop.is_set():
                    reason = "stopped"
                    break
                due = t0 + index * self.frame_seconds / self.speed
                lag = time.perf_counter() - due
                if lag < 0:
                    time.sleep(-lag)
                elif lag > self.frame_seconds:
                    self.late_frames += 1
                    self.max_lag_seconds = max(self.max_lag_seconds, lag)
                self.process_frame(frame, self.sample_rate)
                self.frames_processed += 1
                if out is not None:
                    try:
                        out.write(frame)
                    except Exception:  # pragma: no cover
                        out = None
        except Exception as exc:
            logger.exception("test feed source failed")
            self.error = str(exc)
            reason = "error"
        finally:
            if out is not None:
                try:
                    out.stop()
                    out.close()
                except Exception:  # pragma: no cover
                    pass
            if self.error and reason == "ended":
                reason = "error"
            self.finish_reason = reason
            if self.on_finish is not None:
                try:
                    self.on_finish(reason)
                except Exception:  # pragma: no cover
                    logger.exception("test feed on_finish failed")
