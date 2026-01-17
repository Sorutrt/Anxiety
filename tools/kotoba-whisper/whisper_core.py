import sys

import torch
from transformers import pipeline
from transformers.utils import logging


def configure_stdio() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    logging.set_verbosity_error()


def resolve_device() -> str:
    if torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


# Centralize model loading so the persistent server can initialize once.
def build_pipeline(model: str):
    device = resolve_device()
    torch_dtype = torch.float16 if device.startswith("cuda") else torch.float32
    model_kwargs = {"attn_implementation": "sdpa"} if device.startswith("cuda") else {}
    return pipeline(
        task="automatic-speech-recognition",
        model=model,
        torch_dtype=torch_dtype,
        device=device,
        model_kwargs=model_kwargs,
        batch_size=8,
        trust_remote_code=False,
    )


def extract_text(result) -> str:
    if isinstance(result, dict):
        if "text" in result and isinstance(result["text"], str):
            return result["text"]
        if "chunks" in result and isinstance(result["chunks"], list):
            return " ".join(chunk.get("text", "") for chunk in result["chunks"]).strip()
        text_keys = [key for key in result.keys() if key.startswith("text/")]
        if text_keys:
            return " ".join(str(result[key]) for key in text_keys).strip()
    return str(result).strip()
