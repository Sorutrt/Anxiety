@echo off
setlocal
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%

if not "%KOTOBA_WHISPER_UV_PROJECT%"=="" set PROJECT_DIR=%KOTOBA_WHISPER_UV_PROJECT%
if not "%KOTOBA_WHISPER_UV_BIN%"=="" (
  "%KOTOBA_WHISPER_UV_BIN%" run --project "%PROJECT_DIR%" python "%SCRIPT_DIR%whisper_cli.py" %*
  exit /b %errorlevel%
)

uv run --project "%PROJECT_DIR%" python "%SCRIPT_DIR%whisper_cli.py" %*
