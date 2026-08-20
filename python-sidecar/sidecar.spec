# PyInstaller spec for the SermonSync Python sidecar (SS-056).
#
# Freezes the FastAPI sidecar into a single executable that Tauri spawns via
# `externalBin` (src-tauri/binaries/python-sidecar-<target-triple>[.exe]).
#
# Build:
#   cd python-sidecar
#   pip install pyinstaller -r requirements.txt
#   pyinstaller sidecar.spec --noconfirm
#   # then rename dist/python-sidecar[.exe] with the target triple and place it
#   # in ../src-tauri/binaries/  (see docs/PACKAGING.md)
#
# NOTE: verified as a spec; the actual freeze + resulting installer are produced
# on each target OS in CI (macOS/Windows/Linux) — a Windows .msi must be built
# on Windows.

from PyInstaller.utils.hooks import collect_all

datas = [("data/bible.db", "data")]
binaries = []
hiddenimports = []

# Collect packages that PyInstaller can't fully trace statically.
for pkg in ("faster_whisper", "ctranslate2", "chromadb", "uvicorn", "fastapi",
            "sounddevice", "onnxruntime"):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        # Package not installed in this build env — skip (e.g. optional deps).
        pass

# uvicorn loads its protocol/loop implementations by string name.
hiddenimports += [
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

a = Analysis(
    ["main.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="python-sidecar",
    console=True,
    upx=False,
    onefile=True,
    disable_windowed_traceback=False,
)
