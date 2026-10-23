"""The local audio URL must support browser seek/range requests."""

from fastapi.testclient import TestClient
from main import app


def test_managed_audio_serves_ranges_and_rejects_missing_files(tmp_path, monkeypatch):
    monkeypatch.setenv("SERMONSYNC_MANAGED_AUDIO_DIR", str(tmp_path))
    asset_id = f"{'a' * 64}-sermonsync-audio-v1"
    asset = tmp_path / asset_id
    asset.mkdir()
    (asset / "playback.mp3").write_bytes(b"0123456789")
    client = TestClient(app)

    url = f"/api/media-audio/{asset_id}/playback.mp3"
    full = client.get(url)
    assert full.status_code == 200
    assert full.content == b"0123456789"
    assert full.headers["content-type"] == "audio/mpeg"
    assert full.headers["accept-ranges"] == "bytes"

    partial = client.get(url, headers={"Range": "bytes=3-6"})
    assert partial.status_code == 206
    assert partial.content == b"3456"
    assert partial.headers["content-range"] == "bytes 3-6/10"

    assert client.get(url, headers={"Range": "bytes=20-30"}).status_code == 416
    assert client.get("/api/media-audio/not-an-id/playback.mp3").status_code == 404
    missing_url = f"/api/media-audio/{'b' * 64}-sermonsync-audio-v1/playback.mp3"
    assert client.get(missing_url).status_code == 404
