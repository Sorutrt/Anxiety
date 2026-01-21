import argparse
import sys

from whisper_core import build_model_context, configure_stdio, transcribe_audio


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenAI-Whisper CLI")
    parser.add_argument("input", help="Input WAV file path")
    parser.add_argument("--model", default="tiny")
    parser.add_argument("--chunk-length", type=int, default=15)
    parser.add_argument("--add-punctuation", action="store_true")
    args = parser.parse_args()

    configure_stdio()

    try:
        if "--chunk-length" in sys.argv:
            print("warning: chunk_length is not supported; ignored", file=sys.stderr)
        if args.add_punctuation:
            print("warning: add_punctuation is not supported; ignored", file=sys.stderr)
        context = build_model_context(args.model)
        text = transcribe_audio(context, args.input)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
