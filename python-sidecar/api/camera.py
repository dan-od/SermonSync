"""Low-overhead local camera fallback for WebKitGTK.

WebKitGTK's PipeWire getUserMedia path can discover a V4L2 camera but fail
while rendering its negotiated stream. This endpoint reads the same device
through FFmpeg and exposes a shared MJPEG stream, which WebKit can render as a
normal image without using the broken media-capture pipeline.
"""

from __future__ import annotations

import asyncio
import os
import re
import struct
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path

try:
    import fcntl
except ImportError:  # Windows imports the sidecar but never uses the Linux bridge.
    fcntl = None

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

router = APIRouter(prefix="/api/camera", tags=["camera"])

_FRAME_HEADER = b"--frame\r\nContent-Type: image/jpeg\r\nCache-Control: no-cache\r\n\r\n"
_FRAME_QUEUE_SIZE = 2
_STOP_GRACE_SECONDS = 0.75
_FIRST_FRAME_TIMEOUT_SECONDS = 5.0
_VIDIOC_QUERYCAP = 0x80685600
_VIDIOC_ENUM_FMT = 0xC0405602
_V4L2_BUF_TYPE_VIDEO_CAPTURE = 1
_V4L2_CAP_VIDEO_CAPTURE = 0x00000001
_V4L2_CAP_VIDEO_CAPTURE_MPLANE = 0x00001000
_V4L2_CAP_DEVICE_CAPS = 0x80000000


def _normalise_label(value: str) -> str:
    value = re.sub(r"\s*\(v4l2\)\s*$", "", value, flags=re.IGNORECASE)
    return " ".join(value.casefold().split())


def _is_capture_device(path: str) -> bool:
    """Exclude UVC metadata nodes, which often have the same camera label."""
    if fcntl is None:
        return False
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
        try:
            capability = bytearray(104)
            fcntl.ioctl(fd, _VIDIOC_QUERYCAP, capability, True)
            all_caps, device_caps = struct.unpack_from("II", capability, 84)
            caps = device_caps if all_caps & _V4L2_CAP_DEVICE_CAPS else all_caps
            return bool(caps & (_V4L2_CAP_VIDEO_CAPTURE | _V4L2_CAP_VIDEO_CAPTURE_MPLANE))
        finally:
            os.close(fd)
    except OSError:
        return False


def _supports_mjpeg(path: str) -> bool:
    """Prefer the camera's compressed input when available to avoid raw USB bandwidth stalls."""
    if fcntl is None:
        return False
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
        try:
            index = 0
            while index < 32:
                descriptor = bytearray(64)
                struct.pack_into("II", descriptor, 0, index, _V4L2_BUF_TYPE_VIDEO_CAPTURE)
                try:
                    fcntl.ioctl(fd, _VIDIOC_ENUM_FMT, descriptor, True)
                except OSError:
                    return False
                if descriptor[44:48] == b"MJPG":
                    return True
                index += 1
            return False
        finally:
            os.close(fd)
    except OSError:
        return False


def _local_capture_devices() -> list[tuple[str, str]]:
    devices: list[tuple[str, str]] = []
    for sys_entry in sorted(Path("/sys/class/video4linux").glob("video*")):
        try:
            label = (sys_entry / "name").read_text(encoding="utf-8").strip()
        except OSError:
            continue
        path = f"/dev/{sys_entry.name}"
        if label and _is_capture_device(path):
            devices.append((path, label))
    return devices


def _find_video_device(label: str) -> str:
    requested = _normalise_label(label)
    if not requested:
        raise HTTPException(status_code=400, detail="A camera label is required.")

    matches: list[tuple[int, str]] = []
    for path, name in _local_capture_devices():
        device_name = _normalise_label(name)
        if requested == device_name:
            score = 0
        elif requested in device_name or device_name in requested:
            score = 1
        else:
            continue
        matches.append((score, path))

    if not matches:
        raise HTTPException(
            status_code=404,
            detail=f"No Linux video device matched camera '{label}'.",
        )
    matches.sort()
    return matches[0][1]


@dataclass
class _CameraStream:
    device: str
    process: asyncio.subprocess.Process | None = None
    reader_task: asyncio.Task[None] | None = None
    stop_task: asyncio.Task[None] | None = None
    clients: set[asyncio.Queue[bytes | None]] = field(default_factory=set)
    connecting: int = 0
    lifecycle_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def start(self) -> None:
        async with self.lifecycle_lock:
            process_running = self.process is not None and self.process.returncode is None
            reader_running = self.reader_task is not None and not self.reader_task.done()
            if process_running and reader_running:
                return
            if self.reader_task is not None and not self.reader_task.done():
                self.reader_task.cancel()
                await asyncio.gather(self.reader_task, return_exceptions=True)
            self.reader_task = None
            if self.process is not None:
                await self._terminate_process(self.process)
                self.process = None

            ffmpeg = os.environ.get("SERMONSYNC_FFMPEG", "ffmpeg")
            input_options = ["-input_format", "mjpeg"] if _supports_mjpeg(self.device) else []
            try:
                self.process = await asyncio.create_subprocess_exec(
                    ffmpeg,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "v4l2",
                    *input_options,
                    "-i",
                    self.device,
                    "-an",
                    "-vf",
                    "fps=24,scale=960:-2:flags=fast_bilinear",
                    "-c:v",
                    "mjpeg",
                    "-q:v",
                    "6",
                    "-threads",
                    "1",
                    "-f",
                    "image2pipe",
                    "pipe:1",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                )
            except FileNotFoundError as error:
                raise HTTPException(
                    status_code=503,
                    detail="FFmpeg is required for the Linux camera fallback.",
                ) from error

            self.reader_task = asyncio.create_task(self._read_frames())

    @staticmethod
    async def _terminate_process(process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        try:
            process.terminate()
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(process.wait(), timeout=1.0)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()

    async def _read_frames(self) -> None:
        process = self.process
        if process is None or process.stdout is None:
            return

        pending = b""
        try:
            while True:
                chunk = await process.stdout.read(64 * 1024)
                if not chunk:
                    break
                pending += chunk
                while True:
                    start = pending.find(b"\xff\xd8")
                    if start < 0:
                        pending = pending[-1:]
                        break
                    end = pending.find(b"\xff\xd9", start + 2)
                    if end < 0:
                        pending = pending[start:]
                        break
                    frame = pending[start : end + 2]
                    pending = pending[end + 2 :]
                    for queue in tuple(self.clients):
                        if queue.full():
                            with suppress(asyncio.QueueEmpty):
                                queue.get_nowait()
                        with suppress(asyncio.QueueFull):
                            queue.put_nowait(frame)
        finally:
            for queue in tuple(self.clients):
                if queue.full():
                    with suppress(asyncio.QueueEmpty):
                        queue.get_nowait()
                with suppress(asyncio.QueueFull):
                    queue.put_nowait(None)
            # Keep the process reference even if the reader exits first. A
            # subsequent start or stop must reap the old FFmpeg process.

    async def add_client(self) -> asyncio.Queue[bytes | None]:
        if self.stop_task is not None:
            self.stop_task.cancel()
            self.stop_task = None
        self.connecting += 1
        try:
            await self.start()
            queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=_FRAME_QUEUE_SIZE)
            self.clients.add(queue)
            return queue
        finally:
            self.connecting -= 1

    async def remove_client(self, queue: asyncio.Queue[bytes | None]) -> None:
        self.clients.discard(queue)
        if not self.clients and self.connecting == 0 and self.stop_task is None:
            self.stop_task = asyncio.create_task(self._stop_after_grace())

    async def _stop_after_grace(self) -> None:
        try:
            await asyncio.sleep(_STOP_GRACE_SECONDS)
            await asyncio.shield(self.stop(if_idle=True))
        except asyncio.CancelledError:
            return
        finally:
            if self.stop_task is asyncio.current_task():
                self.stop_task = None

    async def stop(self, *, if_idle: bool = False) -> None:
        async with self.lifecycle_lock:
            if if_idle and (self.clients or self.connecting):
                return
            if self.reader_task is not None:
                self.reader_task.cancel()
                await asyncio.gather(self.reader_task, return_exceptions=True)
                self.reader_task = None
            process = self.process
            self.process = None
            if process is not None:
                await self._terminate_process(process)


class _CameraManager:
    def __init__(self) -> None:
        self.streams: dict[str, _CameraStream] = {}
        self.lock = asyncio.Lock()

    async def subscribe(self, device: str) -> tuple[_CameraStream, asyncio.Queue[bytes | None]]:
        async with self.lock:
            stream = self.streams.get(device)
            if stream is None:
                stream = _CameraStream(device)
                self.streams[device] = stream
            try:
                queue = await stream.add_client()
            except Exception:
                if not stream.clients:
                    self.streams.pop(device, None)
                raise
            return stream, queue

    async def unsubscribe(
        self,
        device: str,
        stream: _CameraStream,
        queue: asyncio.Queue[bytes | None],
    ) -> None:
        await stream.remove_client(queue)
        if stream.clients:
            return
        await asyncio.sleep(_STOP_GRACE_SECONDS + 0.05)
        async with self.lock:
            if not stream.clients and stream.connecting == 0 and self.streams.get(device) is stream:
                self.streams.pop(device, None)

    async def stop_all(self) -> None:
        async with self.lock:
            streams = list(self.streams.values())
            self.streams.clear()
        await asyncio.gather(*(stream.stop() for stream in streams), return_exceptions=True)


camera_manager = _CameraManager()


@router.get("/devices")
async def camera_devices() -> dict[str, list[dict[str, str]]]:
    devices = [
        {"deviceId": path, "label": label}
        for path, label in _local_capture_devices()
    ]
    return {"devices": devices}


def _resolve_camera_device(label: str | None, device: str | None) -> str:
    if not label and not device:
        raise HTTPException(status_code=400, detail="A camera label or device is required.")
    capture_devices = dict(_local_capture_devices()) if device else {}
    if device and device in capture_devices:
        device_matches_label = not label or (
            _normalise_label(label) in _normalise_label(capture_devices[device])
        )
        if device_matches_label:
            return device
    if label:
        return _find_video_device(label)
    raise HTTPException(status_code=404, detail="The selected video capture device is unavailable.")


@router.get("/frame")
async def camera_frame(label: str | None = None, device: str | None = None) -> Response:
    selected_device = _resolve_camera_device(label, device)
    stream, queue = await camera_manager.subscribe(selected_device)
    try:
        try:
            frame = await asyncio.wait_for(queue.get(), timeout=_FIRST_FRAME_TIMEOUT_SECONDS)
        except asyncio.TimeoutError as error:
            raise HTTPException(
                status_code=504,
                detail="The camera did not deliver a frame.",
            ) from error
        if frame is None:
            raise HTTPException(
                status_code=503,
                detail="The camera stream ended before it produced a frame.",
            )
        return Response(
            frame,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    finally:
        # A snapshot joins the shared capture only long enough to receive one
        # frame. Keep the manager entry so the active MJPEG view is unaffected.
        await stream.remove_client(queue)


@router.get("/mjpeg")
async def camera_mjpeg(label: str | None = None, device: str | None = None) -> StreamingResponse:
    selected_device = _resolve_camera_device(label, device)
    stream, queue = await camera_manager.subscribe(selected_device)

    try:
        first_frame = await asyncio.wait_for(queue.get(), timeout=_FIRST_FRAME_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as error:
        await camera_manager.unsubscribe(selected_device, stream, queue)
        raise HTTPException(
            status_code=504,
            detail=(
                "The camera did not deliver a frame. Retry, or check its "
                "connection and other apps using it."
            ),
        ) from error
    if first_frame is None:
        await camera_manager.unsubscribe(selected_device, stream, queue)
        raise HTTPException(
            status_code=503,
            detail="The camera stream ended before it produced a frame.",
        )

    async def frames():
        try:
            yield _FRAME_HEADER + first_frame + b"\r\n"
            while True:
                frame = await queue.get()
                if frame is None:
                    break
                yield _FRAME_HEADER + frame + b"\r\n"
        finally:
            await camera_manager.unsubscribe(selected_device, stream, queue)

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache"},
    )
