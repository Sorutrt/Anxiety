import argparse
import sys

from moonshine_voice_core import build_model_context, configure_stdio, transcribe_audio


def main() -> int:
    parser = argparse.ArgumentParser(description="Moonshine Voice CLI")
    parser.add_argument("input", help="Input WAV file path")
    parser.add_argument("--language", default="ja")
    parser.add_argument("--max-tokens-per-second", dest="max_tokens_per_second")
    args = parser.parse_args()

    configure_stdio()

    try:
        context = build_model_context(args.language, args.max_tokens_per_second)
        text = transcribe_audio(context, args.input)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
