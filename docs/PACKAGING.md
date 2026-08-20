# SermonSync — Packaging & Installer (SS-056)

Goal: a single installer (`.msi`/`.exe` on Windows) that bundles the Tauri app,
the frozen Python sidecar, the Bible DB, and model weights — no separate Python
install required.

> **Status:** the freeze recipe + CI wiring below are in place. The final
> Windows `.msi` must be **built on Windows** (cross-building a Windows installer
> from macOS is not supported) — this is the one remaining step and it runs in
> the `build-tauri (windows-latest)` CI job. See "Remaining" at the bottom.

## 1. Freeze the sidecar (per OS)

```bash
cd python-sidecar
pip install pyinstaller -r requirements.txt
pyinstaller sidecar.spec --noconfirm
# → dist/python-sidecar[.exe]
```

The spec bundles `data/bible.db` and collects hidden imports for
faster-whisper / ctranslate2 / chromadb / uvicorn / sounddevice.

## 2. Place it where Tauri expects (target-triple suffix)

Tauri's `externalBin` resolves `binaries/python-sidecar-<triple>`:

| OS | triple | file |
|---|---|---|
| Windows | `x86_64-pc-windows-msvc` | `python-sidecar-x86_64-pc-windows-msvc.exe` |
| macOS (ARM) | `aarch64-apple-darwin` | `python-sidecar-aarch64-apple-darwin` |
| Linux | `x86_64-unknown-linux-gnu` | `python-sidecar-x86_64-unknown-linux-gnu` |

```bash
TARGET=$(rustc -vV | sed -n 's/^host: //p')
cp dist/python-sidecar "../src-tauri/binaries/python-sidecar-$TARGET"   # .exe on Windows
```

## 3. Build the installer

```bash
npm run tauri build     # produces the .msi/.exe (Windows), .dmg (macOS), .deb/.AppImage (Linux)
```

## 4. Models

`WHISPER_MODEL` / `LLM_MODEL_PATH` control model loading (README). Options:

- **Bundle** the frozen models into the installer (largest, fully offline).
- **First-run download wizard** (SS-057) — smaller installer, downloads on first
  launch with a skip option for pre-bundled models.
- **Cloud LLM** — ship only Whisper locally, use the Groq fallback (SS-050) for
  Stage 3.

ChromaDB embeddings are rebuilt on first run via
`scripts/build_embeddings.py` (or bundled if pre-built).

## CI

`.github/workflows/ci.yml` `build-tauri` currently stages a *placeholder*
sidecar so the Tauri build/bundle is exercised. To produce a real installer,
swap that step for the freeze in §1 before `npm run tauri build`, and upload the
bundle as a CI artifact.

## Remaining (blocked here)

- The real `.msi` build + install/uninstall smoke test must run on **Windows**
  (CI `windows-latest` or a Windows box). PyInstaller + faster-whisper/chromadb
  can need hidden-import tweaks that only surface when freezing on the target OS.
- GPU driver detection at install time is a Windows-installer concern (NSIS/WiX
  custom action) — to be added to the Tauri bundler config on Windows.
