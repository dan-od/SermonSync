# SermonSync

SermonSync listens to a service, suggests relevant Bible passages, and lets an operator send scripture, songs, images, video, and audio to a projector. The desktop app uses Tauri and React; a local Python sidecar handles audio capture, transcription, and scripture matching.

## Run locally

Install Node.js, Rust with the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/), Python, and FFmpeg. Then, from the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r python-sidecar/requirements.txt
npm ci
npm run tauri dev
```

The development app starts the Python sidecar from `.venv/bin/python` when that file exists, or from `python3` otherwise. Its health endpoint is `http://127.0.0.1:8000/health`; API routes are listed at `http://127.0.0.1:8000/docs`.

## Check changes

```bash
npm run lint
npm test
npm run build
.venv/bin/python -m pytest -q python-sidecar/tests
```

The repository includes a Bible database. To rebuild it or its embeddings, use the scripts in `python-sidecar/scripts/`.

## Package the app

Run `npm run tauri build` for a desktop bundle. A Linux RPM also needs the frozen sidecar and Whisper model staged first with `npm run build:sidecar`; use `npm run tauri build -- --config src-tauri/tauri.linux.conf.json` for that target. See [packaging notes](docs/PACKAGING.md) for the other platforms.

For service setup and the operator workflow, see the [operator guide](docs/OPERATOR.md). [Benchmarks](docs/BENCHMARKS.md) record measured latency and hardware details.
