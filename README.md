# ReadDiscordByA.I.VOICE
Discord の VC で A.I.VOICE のキャラと喋れる bot です。
STT→LLM→A.I.VOICEで返答音声を生成して再生します。
Windows + A.I.VOICE Editor 前提、ユーザーとボット 1 対 1 運用を想定しています。

## 仕様/関連ドキュメント
- キャラクター定義: `data/characters.json`

## キャラクター定義(characters.json)
`data/characters.json` でキャラクターの名前や性格を指定します。

```json
[
  {
    "id": "default",
    "displayName": "デフォルト",
    "systemPrompt": "あなたはA.I.VOICEのキャラクターとして、自然な日本語で短く返答します。",
    "speakingStyle": "親しみやすく、テンポよく話してください。",
    "voicePreset": "auto"
  }
]
```

- `id`: 一意な識別子。/set character <id|name> や defaultCharacterId に使われます（小文字化して照合）。日本語も可。
- `displayName`: 表示名。/set character の名前照合に使われます（小文字化して照合）。
- `systemPrompt`: LLM のシステムプロンプト本文。
- `speakingStyle`: 口調・話し方の指示。systemPrompt と連結されます。
- `voicePreset`: A.I.VOICE のボイスプリセット名 or ボイス名。"auto" または空なら先頭のボイスにフォールバックします。

## 現在の実装状況（コードベース）
- [x] VC参加/退出、再生スキップ、履歴リセット
- [x] VC音声受信と発話区切り（緑ランプベース）
- [x] STT（Moonshine Voice）
- [x] LLM（Ollama / Gemini / OpenRouter）
- [x] A.I.VOICE 生成 + VC再生
- [x] 1対1ガード、デバッグログ、フォールバック
- [x] タイムアウト + リトライ（STT/LLM/TTS）
- [ ] COOLDOWN状態の実運用
- [ ] 設定の永続化（現在はメモリのみ）

## Requipments
- Windows
- A.I.VOICE Editor
- Node.js 22.12.0 以上（`@discordjs/voice` の DAVE 対応に必要、`mise` 推奨）
- [winax](https://www.npmjs.com/package/winax) 
- Python 3.12（`uv` 推奨）
- Discord Bot のトークン

## セットアップ
以降の手順は PowerShell 7 前提です。

### 0. 事前準備
Node と Python を準備します。

```powershell
mise install
uv python install 3.12.12
```

2026-03-03 以降、Discord の非 Stage VC は DAVE 必須になったため、このプロジェクトも
`@discordjs/voice` の DAVE 対応版と Node.js 22.12.0 以上を前提にしています。

### 1. Discord Bot の作成
Discord Developer Portal で bot を作成します。
必要な設定の目安:
- SCOPES: `applications.commands`, `bot`
- BOT PERMISSIONS:
  - TEXT PERMISSIONS: `Send Messages`
  - VOICE PERMISSIONS: `Connect`, `Speak`
- Privileged Gateway Intents:
  - `MESSAGE CONTENT INTENT`
  - `SERVER MEMBERS INTENT`

![許可設定画像](./img/readme/botperm.png)

### 2. 取得と依存インストール
```
git clone https://github.com/Sorutrt/Anxiety.git
cd Anxiety
mise active
npm install
```

### 2.5. @discordjs/opus のビルド（Windows/Node22 で decode error が出る場合）
Opus が `opusscript` にフォールバックすると「Invalid packet」が出やすいので、`@discordjs/opus` を使えるようにします。

1) Visual Studio Build Tools 2022 をインストール  
ワークロード「C++ によるデスクトップ開発」を選択し、`MSVC v143` / `Windows SDK` / `MSBuild` を含めます。

2) `mise` で Python を入れて、このコマンドだけで指定
```
mise install python@3.11
$py = "C:\Users\user\AppData\Local\mise\installs\python\3.11.14\python.exe"
$env:npm_config_python=$py
npm rebuild @discordjs/opus
Remove-Item Env:npm_config_python
```

3) 動作確認（`@discordjs/opus` が出ること）
```
node -e "const prism=require('prism-media'); new prism.opus.Decoder({rate:48000,channels:2,frameSize:960}); console.log(prism.opus.Decoder.type)"
```

※ Python のパスは環境で変わるため適宜読み替えてください。  
※ Python は `mise use` で常時有効にしなくてもOKです（tools/ 以下の Python と分離できます）。

### 3. 環境変数
`.env.example` をコピーして `.env` を作成し、必須項目と必要な条件付き項目を設定します。

```
copy .env.example .env
notepad .env
```

### 4. Moonshine Voice の準備
STT には Moonshine Voice を使います。
`tools/moonshine-voice` で Python 依存を入れ、日本語モデルを取得します。

```
uv sync --project .\tools\moonshine-voice
uv run --project .\tools\moonshine-voice python -m moonshine_voice.download ja
```

### 5. Ollama（ローカルLLMを使う場合）
```
powershell -ExecutionPolicy Bypass -File .\tools\ollama\install.ps1
.\tools\ollama\ollama.ps1 pull qwen2.5:3b-instruct
```

`/join` 実行時に Ollama が未起動なら自動で起動します。
`/leave` や 1対1ガードで停止した場合は自動で終了します。

### 6. voice ディレクトリ
A.I.VOICE の音声出力先として `voice` が必要です。

```
New-Item -ItemType Directory -Path voice
```

### 7. スラッシュコマンドの登録
```
npx tsx .\src\deployCommands.ts
```

## 起動
開発時:
```
npx tsx .\src\main.ts
```

ビルドして実行:
```
npm run compile
npm run start
```

## コマンド
- `/join` VC参加と会話モード開始
- `/leave` VC退出
- `/skip` 再生中の音声をスキップ
- `/reset` 会話履歴をクリア
- `/set character <id|name>` 話者切り替え
- `/set debug_channel <#channel>` デバッグログ出力先
- `/debug on|off` / `/debug level <0|1|2>` ログ量調整

## 環境変数
必須:
- `TOKEN` Discord Bot のトークン
- `CLIENT_ID` Discord アプリケーションのクライアント ID
- `GUILD_ID` コマンドを登録する Discord サーバー ID

任意:
- `PERMITTED_USERS` 将来的な運用ガード用のユーザー ID 一覧（カンマ区切り、現在の実装では未使用）

LLM:
- `LLM_PROVIDER` 任意。`ollama` / `gemini` / `openrouter`。未指定時は `ollama`
- `OLLAMA_LLM_MODEL` 任意。Ollama 利用時のモデル名。未指定時は `qwen2.5:3b-instruct`
- `GEMINI_LLM_MODEL` 任意。Gemini 利用時のモデル名。未指定時は `gemini-2.5-flash-lite`
- `OPENROUTER_LLM_MODEL` 任意。OpenRouter 利用時のモデル名。未指定時は `google/gemma-3-27b-it:free`
- `GEMINI_API_KEY` 条件付き必須。Gemini 利用時のみ必要
- `OPENROUTER_API_KEY` 条件付き必須。OpenRouter 利用時のみ必要

STT(Moonshine Voice):
- `MOONSHINE_VOICE_PERSISTENT` 任意。`1` / `0`。未指定時は有効
- `MOONSHINE_VOICE_WORKERS` 任意。常駐ワーカー数。未指定時は `1`
- `MOONSHINE_VOICE_BIN` 条件付き任意。常駐ワーカーを使わない場合の CLI パス
- `MOONSHINE_VOICE_UV_BIN` 任意。`uv` 実行ファイルのパス
- `MOONSHINE_VOICE_UV_PROJECT` 任意。`tools/moonshine-voice` 以外を使う場合のプロジェクトパス
- `MOONSHINE_VOICE_ARGS` 任意。追加引数
- `MOONSHINE_VOICE_TIMEOUT_SEC` 任意。タイムアウト秒
- `MOONSHINE_VOICE_DEBUG` 任意。`1` で詳細ログ

※ `.env.example` も参照してください。

## A.I.VOICE Editor 設定
### プロジェクト設定
- 音声ファイル保存
  - ファイル分割: 1つのファイルに書き出す
  - ファイル形式: WAVE 44100Hz 16bit PCM
  - テキストファイル: `テキストファイルを音声ファイルと一緒に保存する` を有効
  - 音声ファイルパスの指定方法: 命名規則を指定して選択
  - フォルダー: `./voice/`
  - 命名規則: `{Text} `

### 環境設定
- 音声保存時に毎回設定を表示する: OFF
- メッセージ表示レベル: 簡潔

## 開発メモ
### winax のネイティブビルドが失敗する場合（Windows）
`node-gyp` 用に `uv` の Python を渡します。

```
$py = "C:\Users\user\AppData\Roaming\uv\python\cpython-3.12.12-windows-x86_64-none\python.exe"
$env:PYTHON = $py
$env:npm_config_python = $py
$env:Path = (Split-Path $py) + ";" + $env:Path

cd .\node_modules\winax
npm exec -- node-gyp rebuild --python "$py"
cd ..\..
```

### テスト
- `npm run test:stt` Moonshine Voice のSTTテスト
- `npm run test:ollama` Ollama応答テスト

各テストは `STT_TEST_AUDIO_PATH` などの環境変数が必要です。詳細はテストファイルを参照してください。

## ロードマップ
- 短期: MVP運用の安定化（タイムアウト/リトライ値の調整、ログの整備、セットアップ簡易化）
- 中期: コンポーネント分離（HTTP/IPC）、設定の永続化
- 保留: 複数人同時発話、長期記憶、録音アーカイブ

## ライセンス
`LICENSE` を参照してください。



