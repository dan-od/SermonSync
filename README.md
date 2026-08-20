# SermonSync

Live scripture display for church services. Audio comes in, Whisper transcribes it, the engine matches Bible verses in real time, and you push them to the projector.

## Recent changes

A batch of work that had been sitting locally is landing together, so here's what actually changed instead of a wall of commit messages:

- **Scripture search got a real toggle.** The library panel now switches between a words search (fuzzy text matching against verse content) and a reference search that parses input incrementally — type `2`, see every book starting with 2, keep typing and it narrows down to a chapter and verse, Enter pushes it live. Book/chapter/verse selection no longer resets itself mid-search, and pushing a reference to preview or live now fetches the actual verse text from the sidecar instead of echoing back the typed string.
- **Settings actually persist now.** Groq and other model provider API keys used to vanish every restart because they were saved to secure storage but never reloaded into the app on launch. They're rehydrated at startup now, and the Groq-enabled toggle is saved too.
- **A slide template studio landed** (`src/components/Templates/`) — canvas, layer panel, inspector, and toolbar for building custom projector layouts, backed by a new `templateStore` and `templateStorage` persistence layer.
- **CI exists now.** `.github/workflows/ci.yml` runs ESLint, Ruff, `tsc --noEmit`, Vitest, a Vite build, and a Tauri build across Ubuntu and Windows on every push and PR.
- **A test suite exists.** Vitest covers the Zustand stores and scripture search logic; `pytest` coverage grew for Bible import, audio capture, and transcription on the Python side.
- Assorted fixes: branch login flow cleanup, audio capture/device handling, status bar and layout polish, and projector view rendering tweaks.

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri (Rust) |
| Frontend | React + TypeScript + Vite |
| Sidecar | Python — Whisper, VAD, trie/semantic/LLM matchers |
| Database | SQLite (Bible text + embeddings) |

## Architecture

```
 microphone
     │  (16 kHz mono PCM)
     ▼
[capture] ─► [VAD gate] ─► [worship/scene detect]
     │            │  speech only
     │            ▼
     │      [Faster-Whisper]  ── transcription ──►  [sentence buffer]
     │                                                     │ assembled sentence + rolling context
     ▼                                                     ▼
 /ws/audio  ◄── audio_level / vad_state / state_change    [4-stage matcher]
                transcription / sentence / suggestions ◄──  1 Trie → 2 Keyword(BM25)
                system_status / context_update              → 3 LLM(local/Groq/mock) → 4 Semantic(ChromaDB)
                                                                      │ suggestion cards
 operator UI  ─── SEND LIVE ───►  projector output (HDMI / NDI)  ◄────┘
```

- **Sidecar** (`python-sidecar/`, FastAPI on `127.0.0.1:8000`): audio pipeline,
  transcription, 4-stage scripture matching, Bible DB, sessions/archive/presets.
- **Bible DB** (`data/bible.db`, read-only, bundled) vs **app DB**
  (`data/app.db`, writable: sessions, archive, presets, units, settings).
- **WebSocket** `ws://127.0.0.1:8000/ws/audio` streams all live events.
- Full endpoint list: run the sidecar and open `http://127.0.0.1:8000/docs`.

## Hardware requirements

| | CPU | RAM | GPU | Models |
|---|---|---|---|---|
| **Minimum** | 4-core | 8 GB | GTX 1660 (6 GB) | Whisper `base` + Groq LLM |
| **Recommended** | 6-core | 16 GB | RTX 3060 (12 GB) | `large-v3-turbo` + local 8B / Groq |

Runs offline-first; a local GPU is optional if using the Groq cloud fallback.
See [docs/BENCHMARKS.md](docs/BENCHMARKS.md) for measured latency and specs, and
[docs/OPERATOR.md](docs/OPERATOR.md) for the live-service operator guide.

## Dev Setup

```bash
# One-time: build the Bible database and embeddings
python python-sidecar/scripts/build_bible_db.py
python python-sidecar/scripts/build_embeddings.py

# Python sidecar
cd python-sidecar
pip install -r requirements.txt
python main.py

# Frontend (separate terminal)
npm install
npm run tauri dev
```

## Tests

```bash
# Frontend (Vitest)
npm run test

# Python sidecar
cd python-sidecar
pytest tests/
```

## Build

```bash
npm run tauri build
```

## Troubleshooting

### "Bible import failed" / connection refused to localhost:8000

The Python sidecar must be running before the Tauri app can import or browse Bibles. When running in dev mode (`npx tauri dev`) the bundled binary is not used; start the sidecar manually in a separate terminal:

```bash
cd python-sidecar
python main.py
```

Confirm it is up before retrying the import:

```bash
curl http://127.0.0.1:8000/health  # expect {"status":"ok"}
```

### "Bible API error: unknown canonical book 'X'"

The imported XML uses a book name not in the 66-book Protestant canon. Common aliases (`Song of Songs`, `Psalm`, `Revelation of John`, etc.) are resolved automatically. If the name is truly non-canonical, rename the `bname` attribute in the XML to match a standard English book name.

### "Bible API error: unknown chapter N" / chapters missing

The Bible database may be partially built. Rebuild it:

```bash
python python-sidecar/scripts/build_bible_db.py
```

This is also required on a fresh clone before any import will work.

### No audio devices / "audio backend unavailable" (HTTP 503)

`GET /api/audio/devices` returns 503 when PortAudio isn't available, and `[]`
when no input device is connected. Check:

```bash
curl http://127.0.0.1:8000/api/audio/devices
```

- On macOS/Windows the `sounddevice` wheel bundles PortAudio; on Linux install
  it: `sudo apt-get install libportaudio2`.
- Grant the app microphone permission (macOS: System Settings → Privacy →
  Microphone). A headless process may hang on the permission prompt.
- If the selected device is unplugged mid-service, capture emits an
  `audio_error` event and stops; re-select a device and start capture again.

### High latency (SYS shows > 2000 ms)

`GET /api/system/status` reports per-stage latency. Usual causes:

- Whisper running on CPU with a large model — set a smaller model:
  `WHISPER_MODEL=base` (or `tiny`) — or enable GPU (below).
- Real Stage-3 LLM on an under-powered GPU — use the **Groq cloud fallback**
  (`POST /api/groq/config`) so Stage 3 runs in the cloud.
- Check the health endpoint for degraded components: `GET /api/system/health`.

### No GPU detected / slow transcription

The engine auto-detects CUDA (`float16`) and falls back to CPU (`int8`).
Verify: `GET /api/system/engine` → `transcription.device`. If it shows `cpu`
unexpectedly, confirm CUDA + a CUDA-enabled CTranslate2 build. On CPU, prefer
`WHISPER_MODEL=base`/`tiny` and route the LLM stage to Groq.

### Model selection

Set before launching the sidecar:

```bash
export WHISPER_MODEL=large-v3-turbo   # default: tiny (dev). base/small/large-v3/large-v3-turbo
export LLM_MODEL_PATH=models/qwen.gguf # optional local GGUF for Stage 3
```
