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
