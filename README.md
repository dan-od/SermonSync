# SermonSync

Live scripture display for church services. Audio comes in, Whisper transcribes it, the engine matches Bible verses in real time, and you push them to the projector.

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
