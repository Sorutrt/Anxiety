import logging
import sys
from dataclasses import dataclass

import torch
import whisper


def configure_stdio() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    logging.getLogger("whisper").setLevel(logging.ERROR)


def resolve_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


# Bundle model and runtime flags to avoid recomputing per request.
@dataclass(frozen=True)
class ModelContext:
    model: whisper.Whisper
    device: str
    fp16: bool


# Centralize model loading so the persistent server can initialize once.
def build_model_context(model: str) -> ModelContext:
    device = resolve_device()
    fp16 = device.startswith("cuda")
    loaded = whisper.load_model(model, device=device)
    return ModelContext(model=loaded, device=device, fp16=fp16)


# Speed-first transcription config with fixed Japanese settings.
def transcribe_audio(context: ModelContext, audio_path: str) -> str:
    result = context.model.transcribe(
        audio_path,
        language="ja",
        task="transcribe",
        fp16=context.fp16,
        beam_size=1,
        best_of=1,
        temperature=0,
        verbose=False,
    )
    return extract_text(result)


def extract_text(result) -> str:
    if isinstance(result, dict):
        if "text" in result and isinstance(result["text"], str):
            return result["text"]
        if "chunks" in result and isinstance(result["chunks"], list):
            return " ".join(chunk.get("text", "") for chunk in result["chunks"]).strip()
    return str(result).strip()
