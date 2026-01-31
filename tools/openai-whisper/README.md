# openai-whisper CLI

`openai-whisper.cmd` は uv run で `whisper_cli.py` を呼び出すラッパーです。  
`OPENAI_WHISPER_UV_BIN` に uv のパスを指定できます。  
`OPENAI_WHISPER_UV_PROJECT` で uv プロジェクトの場所を変更できます。

## セットアップ例

```powershell
uv python install 3.12.12
uv sync --project .\ --python 3.12.12
uv pip install --index-url https://download.pytorch.org/whl/cu118 torch torchaudio
```

`openai-whisper.cmd` を直接実行する場合は、上記の sync だけでOKです。  
GPUで動かす場合は `torch`/`torchaudio` を CUDA 版に差し替えてください。

## FFmpeg

`openai-whisper` は ffmpeg が必要です。インストールして PATH を通してください。

```powershell
winget install Gyan.FFmpeg
```

## 実行例

```powershell
uv run --project . python .\whisper_cli.py <wav>
```

現在の構成は **音声認識のみ** です（話者分離/句読点補正は省略）。  
`--model` の既定は `small` です。
