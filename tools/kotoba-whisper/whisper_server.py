import argparse
import json
import sys
from typing import Any

from whisper_core import build_pipeline, configure_stdio, extract_text


def write_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


# Serve JSON requests over stdin/stdout for a persistent STT worker.
def main() -> int:
    parser = argparse.ArgumentParser(description="Kotoba-Whisper Server")
    parser.add_argument("--model", default="kotoba-tech/kotoba-whisper-v2.2")
    parser.add_argument("--chunk-length", type=int, default=15)
    parser.add_argument("--add-punctuation", action="store_true")
    args = parser.parse_args()

    configure_stdio()

    try:
        pipe = build_pipeline(args.model)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.add_punctuation:
        print("warning: add_punctuation is not supported; ignored", file=sys.stderr)

    write_json({"type": "ready"})

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            req = json.loads(raw)
        except json.JSONDecodeError as exc:
            print(f"error: invalid request: {exc}", file=sys.stderr)
            continue

        if isinstance(req, dict) and req.get("command") == "shutdown":
            write_json({"type": "shutdown"})
            return 0

        if not isinstance(req, dict):
            write_json({"ok": False, "error": "invalid request"})
            continue

        request_id = req.get("id")
        wav_path = req.get("wav_path")
        if not request_id or not isinstance(wav_path, str):
            write_json({"id": request_id, "ok": False, "error": "invalid request"})
            continue

        try:
            result = pipe(
                wav_path,
                chunk_length_s=args.chunk_length,
            )
            text = extract_text(result)
            write_json({"id": request_id, "ok": True, "text": text})
        except Exception as exc:
            write_json({"id": request_id, "ok": False, "error": str(exc)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
