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

function Test-OllamaHealthy {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Wait-OllamaHealthy {
  param([int]$TimeoutSec = 20)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-OllamaHealthy) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Ollama server did not become ready in ${TimeoutSec}s."
}

$startedHere = $false
$serverProcess = $null
if ($args.Count -gt 0 -and $args[0] -ne "serve") {
  if (-not (Test-OllamaHealthy)) {
    $serverProcess = Start-Process -FilePath $ExePath -ArgumentList "serve" -PassThru -WindowStyle Hidden
    $startedHere = $true
    Wait-OllamaHealthy
  }
}

try {
  & $ExePath @args
} finally {
  if ($startedHere -and $serverProcess) {
    Stop-Process -Id $serverProcess.Id -Force
  }
}
