# SermonSync

Live-service presentation software with speech-driven scripture suggestions. SermonSync transcribes audio from a selected input, matches spoken references against a local Bible database, and gives an operator control over what appears on the projector.

**Status:** early development (`0.1.0`). The repository contains the application and development workflow; packaged release support varies by platform. See [packaging notes](docs/PACKAGING.md).

## What it does

During a service, SermonSync shows a transcript and a deck of scripture suggestions. An operator can review a suggestion, edit its reference, send it to the live output, or dismiss it. The app also has a scripture browser, session archive, song and media libraries, slide templates, and a projector desk for previewing and controlling output.

Speech recognition and scripture matching run through a local Python sidecar. A Groq API key can enable the optional cloud matching stage; without it, the app uses its local matching pipeline. The app keeps session and archive data in a local SQLite database. For the day-to-day operator workflow, see the [operator guide](docs/OPERATOR.md).

## Features

- Live audio transcription, speech and worship detection, and scripture suggestions with confidence scores.
- Operator controls to send, edit, dismiss, or pin suggestions; auto-send can be configured in settings.
- Projector preview and live output, with scripture, songs, text, and imported image, video, and audio media.
- Scripture search and Bible version management, including import of supported Bible text files.
- Session history with transcripts, suggestions, and operator actions.
- Optional Groq matching. When enabled, transcript content used for a match is sent to Groq.

The app includes a branch sign-in screen.

## Requirements

For development, install Node.js, Rust, Python 3, and the platform dependencies required by Tauri 2. Check Tauri's [prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system. Python packages are listed in `python-sidecar/requirements.txt`.

The repository includes a measured benchmark and hardware notes in [BENCHMARKS.md](docs/BENCHMARKS.md). Treat those as development reference figures; they do not establish a tested minimum for every release build.

## Run from source

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r python-sidecar/requirements.txt
npm ci
npm run tauri dev
```

In development, Tauri starts the Python sidecar using `.venv/bin/python` when present, otherwise `python3`. The sidecar listens on `127.0.0.1:8000`; check `http://127.0.0.1:8000/health` for its health response and open `http://127.0.0.1:8000/docs` for its API reference.

The speech model may need to download on first use. The Linux RPM build stages a Whisper model with the app; other packaging details are in [PACKAGING.md](docs/PACKAGING.md).

## Quick start

1. Start SermonSync and complete the branch sign-in screen.
2. Choose the service's audio input and confirm that the input meter responds.
3. Start a session; the transcript and scripture suggestions appear as the service audio comes in.
4. Review a suggestion and choose **SEND LIVE** to put it on the projector output.

See the [operator guide](docs/OPERATOR.md) for projector setup, Bible versions, archives, and common service issues.

## Configuration and local data

Most operator settings are available in the app's Settings panel, including the speech recognition model. `WHISPER_MODEL` can override the saved model selection when launching the sidecar directly. The RPM build sets internal data and model paths when it launches the sidecar.

Session transcripts, suggestions, and operator actions are stored locally in the sidecar's writable `app.db`. The Bible catalog is stored separately in `python-sidecar/data/bible.db`. Browser-side preferences and library metadata use local storage. SermonSync saves provider keys through Tauri's credential storage; the sidecar also stores Groq configuration, including its key, in `app.db`. Optional Groq matching sends the text needed for scripture matching to Groq's API. The app also supports importing and playing user-selected media files.

## Built with

- React 19, TypeScript, and Vite for the desktop interface.
- Tauri 2 and Rust for the desktop shell, system integration, and projector windows.
- Python, FastAPI, and WebSockets for local transcription, scripture matching, and the sidecar API.
- SQLite for Bible text and locally archived session data.

## Repository map

```text
src/                 React interface, stores, and projector views
src-tauri/           Tauri and Rust desktop code, app configuration
python-sidecar/      Local API, audio/transcription pipeline, Bible database
docs/                Operator, packaging, benchmark, and feature notes
scripts/             Development and packaging scripts
```

## Development commands

```bash
npm run tauri dev                 # Run the desktop app
npm run lint                      # Lint the frontend
npm test                          # Run frontend tests
npm run build                     # Build the frontend
.venv/bin/python -m pytest -q python-sidecar/tests  # Run sidecar tests
```

For a Linux RPM, stage the sidecar and model before bundling:

```bash
npm ci
npm run build:sidecar
npm run tauri build -- --config src-tauri/tauri.rpm.conf.json
```

See [PACKAGING.md](docs/PACKAGING.md) for the current platform-specific packaging state and limitations.
