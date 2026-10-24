# PyInstaller spec for the SermonSync Python sidecar (SS-056).
#
# Freezes the FastAPI sidecar into a single executable that Tauri spawns via
# `externalBin` (src-tauri/binaries/python-sidecar-<target-triple>[.exe]).
#
# Build (Linux RPM flow): scripts/build-sidecar.sh
#   Produces an ONEDIR bundle (no per-launch unpacking) at
#   src-tauri/resources/sidecar/, shipped as a Tauri resource and launched by
#   src-tauri/src/lib.rs.

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
    excludes=["tkinter", "matplotlib", "pytest", "torch", "pandas", "IPython", "notebook", "PIL.ImageTk"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="python-sidecar",
    console=True,
    upx=False,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="sidecar",
)
