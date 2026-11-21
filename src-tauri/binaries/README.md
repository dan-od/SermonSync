# Sidecar binaries

Tauri's `bundle.externalBin` (`binaries/python-sidecar`) resolves to a
platform-suffixed executable at build/run time, e.g.:

- `python-sidecar-aarch64-apple-darwin`   (Apple Silicon macOS)
- `python-sidecar-x86_64-apple-darwin`    (Intel macOS)
- `python-sidecar-x86_64-pc-windows-msvc.exe`
- `python-sidecar-x86_64-unknown-linux-gnu`

The local Windows NSIS build uses `tauri.windows.conf.json` and packages the
PyInstaller `onedir` sidecar from `resources/sidecar/` instead. See
`docs/PACKAGING.md` for its build steps. The external-binary path remains the
default configuration used by CI and the current macOS path.

For the default external-binary path, freeze `python-sidecar/main.py` into a standalone executable
(e.g. with PyInstaller: `pyinstaller --onefile main.py`) and drop the result
here with the target-triple suffix. Tauri then spawns it on app start via the
`.setup()` hook in `src/lib.rs`.

**Dev workflow (current skeleton):** no frozen binary yet — run the sidecar
directly:

```
cd python-sidecar
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py    # serves http://127.0.0.1:8000
```

The app's `check_sidecar_health` command hits `GET /health` against that
running server regardless of how it was launched.
