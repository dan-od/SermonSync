$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sidecarRoot = Join-Path $root "python-sidecar"
$resourceRoot = Join-Path $root "src-tauri/resources"
$venvPython = Join-Path $sidecarRoot ".build-venv/Scripts/python.exe"

if (-not (Test-Path $venvPython)) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv (Join-Path $sidecarRoot ".build-venv")
    } else {
        & python -m venv (Join-Path $sidecarRoot ".build-venv")
    }
    if ($LASTEXITCODE -ne 0) { throw "Could not create the sidecar build environment." }
}

Push-Location $sidecarRoot
try {
    & $venvPython -m pip install --quiet --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "Could not upgrade pip." }
    & $venvPython -m pip install --quiet pyinstaller -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "Could not install sidecar build dependencies." }

    foreach ($path in @("build", "dist")) {
        $resolved = Join-Path $sidecarRoot $path
        if (Test-Path $resolved) { Remove-Item -Recurse -Force $resolved }
    }
    & $venvPython -m PyInstaller sidecar.spec --noconfirm --clean
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed to build the sidecar." }
} finally {
    Pop-Location
}

$stagedSidecar = Join-Path $resourceRoot "sidecar"
$stagedWhisper = Join-Path $resourceRoot "whisper"
foreach ($path in @($stagedSidecar, $stagedWhisper)) {
    if (Test-Path $path) { Remove-Item -Recurse -Force $path }
}
New-Item -ItemType Directory -Force -Path $resourceRoot, $stagedWhisper | Out-Null
Copy-Item -Recurse (Join-Path $sidecarRoot "dist/sidecar") $stagedSidecar

& (Join-Path $sidecarRoot ".build-venv/Scripts/python.exe") -c `
    "from huggingface_hub import snapshot_download; import sys; snapshot_download('Systran/faster-whisper-base', cache_dir=sys.argv[1])" `
    $stagedWhisper
if ($LASTEXITCODE -ne 0) { throw "Could not stage the Whisper base model." }

Write-Host "Staged Windows sidecar and Whisper base model in src-tauri/resources."
