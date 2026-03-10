import sys
from dataclasses import dataclass
from typing import Any

from moonshine_voice import Transcriber, get_model_for_language, load_wav_file


def configure_stdio() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")


def uses_compact_spacing(language: str) -> bool:
    return language.lower().startswith(("ja", "zh", "ko"))


def default_max_tokens_per_second(language: str) -> str | None:
    if language.lower().startswith(("ja", "zh", "ko")):
        return "13.0"
    return None


def build_options(language: str, max_tokens_per_second: str | None) -> dict[str, str]:
    resolved = max_tokens_per_second or default_max_tokens_per_second(language)
    if not resolved:
        return {}
    return {"max_tokens_per_second": resolved}


def extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("text", "line", "value"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return ""
    for key in ("text", "line", "value"):
        candidate = getattr(value, key, None)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return str(value).strip()


def extract_transcript_text(transcript: Any, language: str) -> str:
    lines = getattr(transcript, "lines", None)
    if not isinstance(lines, list):
        return extract_text(transcript)

    separator = "" if uses_compact_spacing(language) else " "
    parts = [extract_text(line) for line in lines]
    return separator.join(part for part in parts if part).strip()


# 1ワーカーで使い回すモデルと推論オプションをまとめる。
@dataclass(frozen=True)
class ModelContext:
    transcriber: Transcriber
    language: str


def build_model_context(language: str, max_tokens_per_second: str | None) -> ModelContext:
    model_path, model_arch = get_model_for_language(wanted_language=language)
    options = build_options(language, max_tokens_per_second)
    transcriber = Transcriber(model_path=model_path, model_arch=model_arch, options=options)
    return ModelContext(transcriber=transcriber, language=language)


def transcribe_audio(context: ModelContext, audio_path: str) -> str:
    audio_data, sample_rate = load_wav_file(audio_path)
    transcript = context.transcriber.transcribe_without_streaming(audio_data, sample_rate)
    return extract_transcript_text(transcript, context.language)
