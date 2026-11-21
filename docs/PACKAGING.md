# Packaging SermonSync

The app needs a Python sidecar, a Bible database, and a Whisper model at runtime. The Tauri build configuration differs by platform.

## Linux RPM

The Linux configuration runs a PyInstaller `onedir` sidecar from Tauri resources. Build and stage it before packaging:

```bash
npm ci
npm run build:sidecar
npm run tauri build -- --config src-tauri/tauri.rpm.conf.json
```

The custom filename matters: Tauri loads `tauri.linux.conf.json` automatically for every Linux build, including CI. The RPM configuration should load only when the build command requests it.

`build:sidecar` creates `src-tauri/resources/sidecar/` and downloads the Whisper base model into `src-tauri/resources/whisper/`. Both directories are generated and ignored by Git. The RPM declares WebKitGTK, PortAudio, and GStreamer codec dependencies for media playback.

## Windows and macOS

The default Tauri configuration expects a frozen sidecar at `src-tauri/binaries/python-sidecar-<target-triple>` (with `.exe` on Windows). Build `python-sidecar/sidecar.spec` on the target OS, then stage the executable and its `onedir` support files in a layout that the Tauri launcher can resolve. The current spec produces a `dist/sidecar/` directory; copying only its executable will leave dependencies behind.

The CI Tauri jobs use placeholder sidecars to check compilation and bundling. They don't produce usable installers. A release build still needs a frozen sidecar, model files, and an install test on each target OS.

## Local Windows bundle

The initial Windows bundle is a local NSIS installer, not a public release. Build it on Windows x64 so PyInstaller produces native Windows binaries:

```powershell
npm ci
npm run build:sidecar:windows
npm run tauri build -- --config src-tauri/tauri.windows.conf.json
```

The sidecar script stages the PyInstaller `onedir` output and Whisper base-model cache under `src-tauri/resources/`. Tauri bundles those resources and the verified Windows media engine; the app starts the sidecar from its resource directory and stores writable state in the current user's app-data directory. The installer is written under `src-tauri/target/release/bundle/nsis/`.

Install and launch the generated installer on the target Windows machine to verify the app and audio-device behavior. This local build is not signed or published.
