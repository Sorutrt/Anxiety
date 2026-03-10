# moonshine-voice CLI

`moonshine_voice_cli.py` と `moonshine_voice_server.py` は `moonshine-voice` を使って
WAV を文字起こしするための薄いラッパーです。TypeScript 側は `uv run` でこれらを呼びます。

## セットアップ例

```powershell
uv python install 3.12.12
uv sync --project .\tools\moonshine-voice --python 3.12.12
uv run --project .\tools\moonshine-voice python -m moonshine_voice.download ja
```

`moonshine-voice` は事前に対象言語のモデルをダウンロードしておく必要があります。  
日本語を使う場合は `ja` を指定してください。

## 実行例

```powershell
uv run --project .\tools\moonshine-voice python .\tools\moonshine-voice\moonshine_voice_cli.py .\voice\stt-test\sample.wav
```

## オプション

- `--language`: 既定は `ja`
- `--max-tokens-per-second`: Moonshine Voice のストリーム設定に渡す値。未指定時は日本語で `13.0`
