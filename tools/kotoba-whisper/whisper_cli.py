import argparse
import sys

from whisper_core import build_pipeline, configure_stdio, extract_text


def main() -> int:
    parser = argparse.ArgumentParser(description="Kotoba-Whisper CLI")
    parser.add_argument("input", help="Input WAV file path")
    parser.add_argument("--model", default="kotoba-tech/kotoba-whisper-v2.2")
    parser.add_argument("--chunk-length", type=int, default=15)
    parser.add_argument("--add-punctuation", action="store_true")
    args = parser.parse_args()

    configure_stdio()

    try:
        pipe = build_pipeline(args.model)
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
