#!/usr/bin/env bash
# Freezes the Python sidecar (onedir) and stages the Whisper base model for the
# Linux RPM. Output: src-tauri/resources/{sidecar,whisper}.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/python-sidecar"

[ -d .build-venv ] || python3 -m venv .build-venv
.build-venv/bin/pip install --quiet --upgrade pip
.build-venv/bin/pip install --quiet pyinstaller -r requirements.txt

rm -rf build dist
.build-venv/bin/pyinstaller sidecar.spec --noconfirm --clean

out="$root/src-tauri/resources"
rm -rf "$out/sidecar" "$out/whisper"
mkdir -p "$out/whisper"
cp -r dist/sidecar "$out/sidecar"

# Stage the base model once in HF cache layout (download_root-compatible).
.build-venv/bin/python - "$out/whisper" <<'PY'
import sys
from huggingface_hub import snapshot_download
snapshot_download("Systran/faster-whisper-base", cache_dir=sys.argv[1])
PY
du -sh "$out/sidecar" "$out/whisper"
