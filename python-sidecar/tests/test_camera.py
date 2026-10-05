"""Camera discovery and stalled-stream feedback."""

from __future__ import annotations

import asyncio
import struct

import pytest
from fastapi import HTTPException

from api import camera


def test_metadata_node_is_not_a_video_capture(monkeypatch):
    monkeypatch.setattr(camera.os, "open", lambda *_args: 42)
    monkeypatch.setattr(camera.os, "close", lambda _fd: None)

    def query_metadata(_fd, _request, result, _mutate):
        struct.pack_into("II", result, 84, camera._V4L2_CAP_DEVICE_CAPS, 0x04A00000)

    monkeypatch.setattr(camera.fcntl, "ioctl", query_metadata)
    assert camera._is_capture_device("/dev/video2") is False

    def query_capture(_fd, _request, result, _mutate):
        struct.pack_into("II", result, 84, camera._V4L2_CAP_DEVICE_CAPS, 0x04200001)

    monkeypatch.setattr(camera.fcntl, "ioctl", query_capture)
    assert camera._is_capture_device("/dev/video1") is True


def test_mjpeg_input_is_detected_without_opening_a_stream(monkeypatch):
    monkeypatch.setattr(camera.os, "open", lambda *_args: 42)
    monkeypatch.setattr(camera.os, "close", lambda _fd: None)

    def enumerate_formats(_fd, _request, result, _mutate):
        index = struct.unpack_from("I", result, 0)[0]
        if index > 1:
            raise OSError("No more formats")
        result[44:48] = b"YUYV" if index == 0 else b"MJPG"

    monkeypatch.setattr(camera.fcntl, "ioctl", enumerate_formats)
    assert camera._supports_mjpeg("/dev/video1") is True


def test_native_device_endpoint_returns_capture_nodes(monkeypatch):
    monkeypatch.setattr(camera, "_local_capture_devices", lambda: [("/dev/video1", "USB3 Video"), ("/dev/video3", "Integrated Webcam_HD")])
    assert asyncio.run(camera.camera_devices()) == {
        "devices": [
            {"deviceId": "/dev/video1", "label": "USB3 Video"},
            {"deviceId": "/dev/video3", "label": "Integrated Webcam_HD"},
        ]
    }


def test_snapshot_returns_one_jpeg_without_stopping_live_clients(monkeypatch):
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    queue.put_nowait(b"\xff\xd8frame\xff\xd9")
    released = []

    class FakeStream:
        async def remove_client(self, client_queue):
            released.append(client_queue)

    async def subscribe(_device):
        return FakeStream(), queue

    monkeypatch.setattr(camera, "_resolve_camera_device", lambda _label, _device: "/dev/video3")
    monkeypatch.setattr(camera.camera_manager, "subscribe", subscribe)

    response = asyncio.run(camera.camera_frame(device="/dev/video3"))
    assert response.media_type == "image/jpeg"
    assert response.body == b"\xff\xd8frame\xff\xd9"
    assert released == [queue]


def test_stalled_camera_returns_error_instead_of_blank_image(monkeypatch):
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    unsubscribed = []

    async def subscribe(_device):
        return object(), queue

    async def unsubscribe(device, stream, client_queue):
        unsubscribed.append((device, stream, client_queue))

    monkeypatch.setattr(camera, "_find_video_device", lambda _label: "/dev/video3")
    monkeypatch.setattr(camera.camera_manager, "subscribe", subscribe)
    monkeypatch.setattr(camera.camera_manager, "unsubscribe", unsubscribe)
    monkeypatch.setattr(camera, "_FIRST_FRAME_TIMEOUT_SECONDS", 0.001)

    with pytest.raises(HTTPException) as error:
        asyncio.run(camera.camera_mjpeg(label="Integrated Webcam_HD"))

    assert error.value.status_code == 504
    assert len(unsubscribed) == 1


def test_live_ffmpeg_without_reader_is_restarted(monkeypatch):
    class FakeProcess:
        def __init__(self):
            self.returncode = None
            self.terminated = False

        def terminate(self):
            self.terminated = True
            self.returncode = -15

        async def wait(self):
            return self.returncode

    old_process = FakeProcess()
    new_process = FakeProcess()

    async def create_process(*_args, **_kwargs):
        return new_process

    async def idle_reader(_self):
        await asyncio.Event().wait()

    monkeypatch.setattr(camera, "_supports_mjpeg", lambda _device: False)
    monkeypatch.setattr(camera.asyncio, "create_subprocess_exec", create_process)
    monkeypatch.setattr(camera._CameraStream, "_read_frames", idle_reader)

    async def run():
        stream = camera._CameraStream("/dev/video3", process=old_process)
        stream.reader_task = asyncio.create_task(asyncio.sleep(0))
        await stream.reader_task
        await stream.start()
        assert old_process.terminated is True
        assert stream.process is new_process
        assert stream.reader_task is not None and not stream.reader_task.done()
        await stream.stop()

    asyncio.run(run())


def test_cancelled_idle_stop_cannot_leave_a_readerless_process(monkeypatch):
    class FakeProcess:
        returncode = None

    old_process = FakeProcess()
    new_process = FakeProcess()

    async def create_process(*_args, **_kwargs):
        return new_process

    async def idle_reader(_self):
        await asyncio.Event().wait()

    monkeypatch.setattr(camera, "_STOP_GRACE_SECONDS", 0)
    monkeypatch.setattr(camera, "_supports_mjpeg", lambda _device: False)
    monkeypatch.setattr(camera.asyncio, "create_subprocess_exec", create_process)
    monkeypatch.setattr(camera._CameraStream, "_read_frames", idle_reader)

    async def run():
        stream = camera._CameraStream("/dev/video3", process=old_process)
        stream.reader_task = asyncio.create_task(idle_reader(stream))
        stop_entered = asyncio.Event()
        allow_stop = asyncio.Event()

        async def terminate(process):
            stop_entered.set()
            await allow_stop.wait()
            process.returncode = -15

        monkeypatch.setattr(stream, "_terminate_process", terminate)
        stream.stop_task = asyncio.create_task(stream._stop_after_grace())
        await asyncio.wait_for(stop_entered.wait(), timeout=1)
        stream.stop_task.cancel()
        joining = asyncio.create_task(stream.add_client())
        allow_stop.set()
        queue = await asyncio.wait_for(joining, timeout=1)
        assert queue in stream.clients
        assert old_process.returncode == -15
        assert stream.process is new_process
        assert stream.reader_task is not None and not stream.reader_task.done()
        await stream.stop()

    asyncio.run(run())
