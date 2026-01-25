$ErrorActionPreference = "Stop"

$Version = "v0.15.1"
$ZipName = "ollama-windows-amd64.zip"
$DownloadUrl = "https://github.com/ollama/ollama/releases/download/$Version/$ZipName"

$RootDir = $PSScriptRoot
$ZipPath = Join-Path $RootDir $ZipName
$ExePath = Join-Path $RootDir "ollama.exe"
$ModelsDir = Join-Path $RootDir "models"
$TmpDir = Join-Path $RootDir "tmp"
$VersionFile = Join-Path $RootDir "version.txt"

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
  throw "curl.exe not found. Please run on a Windows environment that provides curl.exe."
}

& curl.exe -L -o $ZipPath $DownloadUrl
Expand-Archive -Path $ZipPath -DestinationPath $RootDir -Force
Remove-Item -Path $ZipPath -Force

if (-not (Test-Path -Path $ExePath)) {
  throw "ollama.exe not found after extract: $ExePath"
}

New-Item -ItemType Directory -Path $ModelsDir -Force | Out-Null
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
Set-Content -Path $VersionFile -Value $Version

Write-Output "Installed Ollama $Version to $RootDir"
