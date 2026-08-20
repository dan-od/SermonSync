# SermonSync — Operator Manual & Quick-Start

How to run a live service with SermonSync. For setup/architecture see the
[README](../README.md); for hardware/latency see [BENCHMARKS.md](BENCHMARKS.md).

## Quick-start (5 minutes)

1. **Start the AI sidecar** (or let the app launch it):
   ```bash
   cd python-sidecar && python main.py
   ```
   Confirm: `curl http://127.0.0.1:8000/health` → `{"status":"ok"}`.
2. **Launch the app** (`npm run tauri dev`, or the installed build).
3. **Pick your audio input** — the sound-board AUX or a USB interface is ideal
   (cleaner than a room mic).
4. **Start the session** — the timer begins; everything from here is archived.
5. **Speak / play the service** — transcription appears in Q1, scripture
   suggestions stack in Q2.
6. **Send a verse live** — click **SEND LIVE** on a suggestion card; it goes to
   the projector output (Q3).
7. **End the session** when the service is over — it's saved to the archive.

## During a live service

### The three panels
- **Q1 — Ingestion Timeline:** live transcript, tagged `[SPEECH]` / worship /
  silence. Driven by `transcription` / `sentence` WebSocket events.
- **Q2 — Co-Pilot Suggestion Deck:** scripture matches, newest on top, each with
  a confidence %, the pipeline stage that found it, and theme labels.
- **Q3 — Projector + Command Desk:** live output preview, overlay style
  (Widescreen / Lower Third), and manual controls.

### Audio & detection
- **VAD sensitivity** (header): higher = catches quieter speech but more noise.
  `POST /api/audio/vad-sensitivity`. Start at 0.5 and adjust.
- **Worship mode** auto-detects singing/music and pauses transcription to reduce
  noise — no action needed.

### Choosing what goes live
- **SEND LIVE** pushes a suggestion to the projector. Only one verse is live at
  a time; sending a new one replaces it.
- **EDIT REFERENCE** fixes the verse if the AI got the area right but the exact
  verse wrong.
- **Fast Scripture Presets** — one-click common verses (Romans 8:28,
  Philippians 4:13, …). Manage them in Settings; they persist per unit.
- **CLEAR SCREEN** returns the projector to an idle/blank state.

### Bible versions
KJV is bundled and always available. NIV/NKJV/AMP require importing licensed
text (Settings → Bible Versions → Import, `.xml` OSIS/Zefania).

## Multi-unit (multiple churches)
Configure your unit in Settings (default: Foursquare Gospel Church, Mgbuogba,
Port Harcourt). Each unit keeps its own presets and archive. Switch the active
unit from the header. `GET /api/units`, `POST /api/units/{id}/activate`.

## After the service — the archive
Every session stores the full transcript, all suggestions, and your actions
(sent / dismissed / edited). Browse and search past services:
- `GET /api/archive/sessions` — history
- `GET /api/archive/sessions/{id}` — full transcript + suggestions + actions
- `GET /api/archive/search?q=...` — find any past sermon by what was said

## Optional: cloud LLM (Groq)
If your GPU can't run the local LLM, link a Groq API key
(Settings → Intelligence, or `POST /api/groq/config`) so Stage-3 matching runs
in the cloud. Everything else stays offline-first. The **GROQ LINKED** badge
shows when it's active.

## Common issues (operator)
- **No suggestions appearing:** confirm a session is active and audio is
  captured (header waveform moving). Check `GET /api/system/health`.
- **Wrong verse:** use EDIT REFERENCE, or lower VAD sensitivity if it's picking
  up cross-talk.
- **Laggy captions:** see the latency troubleshooting in the README (smaller
  Whisper model or Groq).
- **Projector shows nothing:** ensure a verse is live (SEND LIVE) and the output
  display / LIVE OUT toggle is enabled.
