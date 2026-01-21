# Repo map

- tools/openai-whisper/whisper_core.py: model load, device selection, transcribe settings (language=ja, task=transcribe, fp16 on cuda).
- tools/openai-whisper/whisper_cli.py: CLI args (input, --model, --chunk-length ignored, --add-punctuation ignored).
- tools/openai-whisper/whisper_server.py: JSON protocol server, same args as CLI.
- tools/openai-whisper/README.md: setup steps, ffmpeg, default model.
- tools/openai-whisper/openai-whisper.cmd: uv wrapper.
- src/stt/openaiWhisper.ts: Node wrapper and env var parsing.
- src/stt/openaiWhisper.test.ts: STT test using node:test and CER check.
- package.json: test scripts (node --test --import tsx ...).

# Environment variables (Node wrapper)

- OPENAI_WHISPER_ARGS
- OPENAI_WHISPER_BIN
- OPENAI_WHISPER_UV_BIN
- OPENAI_WHISPER_UV_PROJECT
- OPENAI_WHISPER_PERSISTENT
- OPENAI_WHISPER_WORKERS
- OPENAI_WHISPER_TIMEOUT_SEC
- OPENAI_WHISPER_DEBUG

# Common commands

- node --test --import tsx ./src/stt/openaiWhisper.test.ts
- tools\\openai-whisper\\openai-whisper.cmd <wav>
- uv run --project .\\tools\\openai-whisper python .\\tools\\openai-whisper\\whisper_cli.py <wav>
- uv lock --project .\\tools\\openai-whisper
