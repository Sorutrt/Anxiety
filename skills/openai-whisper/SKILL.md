---
name: openai-whisper
description: Support updates to this repo's OpenAI Whisper integration (tools/openai-whisper, src/stt/openaiWhisper.ts). Use when asked to change model selection, CLI/server args, GPU enablement, STT test behavior, or README updates for openai-whisper.
---

# OpenAI Whisper (repo-local)

## Quick workflow

- Identify the target surface (Python CLI/server, TS wrapper, tests, README).
- Keep CLI/server args compatible with kotoba-whisper; if adding args, update both CLI and server.
- Keep the default model as `tiny`, but allow override via `--model` and `OPENAI_WHISPER_ARGS`.
- If changing GPU behavior, update `tools/openai-whisper/whisper_core.py` and reflect it in `tools/openai-whisper/README.md`.
- If dependencies change, update `tools/openai-whisper/pyproject.toml` and regenerate `tools/openai-whisper/uv.lock`.
- Keep the exported API in `src/stt/openaiWhisper.ts` identical to `src/stt/kotobaWhisper.ts`.
- When adjusting STT tests, emit timing via `t.diagnostic` and keep CER checks intact.

## References

- Read `references/paths.md` for file map, env vars, and common commands.
