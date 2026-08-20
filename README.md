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
