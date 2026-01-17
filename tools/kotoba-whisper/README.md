# kotoba-whisper CLI

`kotoba-whisper.cmd` は uv run で `whisper_cli.py` を呼び出すラッパーです。  
`KOTOBA_WHISPER_UV_BIN` に uv のパスを指定できます。  
`KOTOBA_WHISPER_UV_PROJECT` で uv プロジェクトの場所を変更できます。

## セットアップ例

```powershell
uv python install 3.12.12
uv sync --project .\ --python 3.12.12
```

`kotoba-whisper.cmd` を直接実行する場合は、上記の sync だけでOKです。  
個別に呼び出す場合は次のようになります。

```powershell
uv run --project . python .\whisper_cli.py <wav>
```

現在の構成は **音声認識のみ** です（話者分離/句読点補正は省略）。  
必要な場合は追加依存とPythonバージョン調整が必要です。
