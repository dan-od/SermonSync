# Packaging SermonSync

The app needs a Python sidecar, a Bible database, and a Whisper model at runtime. The Tauri build configuration differs by platform.

## Linux RPM

The Linux configuration runs a PyInstaller `onedir` sidecar from Tauri resources. Build and stage it before packaging:

```bash
npm ci
npm run build:sidecar
npm run tauri build -- --config src-tauri/tauri.linux.conf.json
```

`build:sidecar` creates `src-tauri/resources/sidecar/` and downloads the Whisper base model into `src-tauri/resources/whisper/`. Both directories are generated and ignored by Git. The RPM declares WebKitGTK, PortAudio, and GStreamer codec dependencies for media playback.

## Windows and macOS

The default Tauri configuration expects a frozen sidecar at `src-tauri/binaries/python-sidecar-<target-triple>` (with `.exe` on Windows). Build `python-sidecar/sidecar.spec` on the target OS, then stage the executable and its `onedir` support files in a layout that the Tauri launcher can resolve. The current spec produces a `dist/sidecar/` directory; copying only its executable will leave dependencies behind.

The CI Tauri jobs use placeholder sidecars to check compilation and bundling. They don't produce usable installers. A release build still needs a frozen sidecar, model files, and an install test on each target OS.
