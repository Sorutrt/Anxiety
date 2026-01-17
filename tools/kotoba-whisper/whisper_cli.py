import argparse
import sys

import torch
from transformers import pipeline
from transformers.utils import logging


def resolve_device() -> str:
    if torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Kotoba-Whisper CLI")
    parser.add_argument("input", help="Input WAV file path")
    parser.add_argument("--model", default="kotoba-tech/kotoba-whisper-v2.2")
    parser.add_argument("--chunk-length", type=int, default=15)
    parser.add_argument("--add-punctuation", action="store_true")
    args = parser.parse_args()

    logging.set_verbosity_error()
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    device = resolve_device()
    torch_dtype = torch.float16 if device.startswith("cuda") else torch.float32
    model_kwargs = {"attn_implementation": "sdpa"} if device.startswith("cuda") else {}

    try:
        pipe = pipeline(
            task="automatic-speech-recognition",
            model=args.model,
            torch_dtype=torch_dtype,
            device=device,
            model_kwargs=model_kwargs,
            batch_size=8,
            trust_remote_code=False,
        )

        if args.add_punctuation:
            print("warning: add_punctuation is not supported; ignored", file=sys.stderr)
        result = pipe(
            args.input,
            chunk_length_s=args.chunk_length,
        )
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    text = extract_text(result)
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
