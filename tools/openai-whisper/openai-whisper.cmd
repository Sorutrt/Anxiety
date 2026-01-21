@echo off
setlocal
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%

if not "%OPENAI_WHISPER_UV_PROJECT%"=="" set PROJECT_DIR=%OPENAI_WHISPER_UV_PROJECT%
if not "%OPENAI_WHISPER_UV_BIN%"=="" (
  "%OPENAI_WHISPER_UV_BIN%" run --project "%PROJECT_DIR%" python "%SCRIPT_DIR%whisper_cli.py" %*
  exit /b %errorlevel%
)

uv run --project "%PROJECT_DIR%" python "%SCRIPT_DIR%whisper_cli.py" %*
