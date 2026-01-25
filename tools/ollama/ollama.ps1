$ErrorActionPreference = "Stop"

$RootDir = $PSScriptRoot
$ExePath = Join-Path $RootDir "ollama.exe"
$ModelsDir = Join-Path $RootDir "models"
$TmpDir = Join-Path $RootDir "tmp"

if (-not (Test-Path -Path $ExePath)) {
  throw "ollama.exe not found: $ExePath (run tools/ollama/install.ps1 first)"
}

New-Item -ItemType Directory -Path $ModelsDir -Force | Out-Null
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

$env:OLLAMA_MODELS = $ModelsDir
$env:OLLAMA_TMPDIR = $TmpDir
$env:OLLAMA_HOST = "127.0.0.1:11434"

& $ExePath @args
