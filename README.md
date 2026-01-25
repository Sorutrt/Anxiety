# ReadDiscordByA.I.VOICE
DiscordのVCでユーザー音声を取り込み、STT→LLM→A.I.VOICEで返答音声を生成して再生するボットです。
Windows + A.I.VOICE Editor 前提、1対1運用を想定しています。

## 仕様/関連ドキュメント
- 仕様書: `SPEC.md`
- キャラクター定義: `data/characters.json`

## キャラクター定義(characters.json)

- `id`
- `displayName`
- `systemPrompt`
- `speakingStyle`
- `voicePreset`

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

## 現在の実装状況（コードベース）
- [x] VC参加/退出、再生スキップ、履歴リセット
- [x] VC音声受信と発話区切り（緑ランプベース）
- [x] STT（openai-whisper）
- [x] LLM（Ollama / Gemini / OpenRouter）
- [x] A.I.VOICE 生成 + VC再生
- [x] 1対1ガード、デバッグログ、フォールバック
- [x] タイムアウト + リトライ（STT/LLM/TTS）
- [ ] COOLDOWN状態の実運用
- [ ] 設定の永続化（現在はメモリのみ）

## 必要環境
- Windows（A.I.VOICE Editor / winax）
- Node.js 20（`mise` 推奨）
- Python 3.12（`uv` 推奨）
- Discord Bot のトークン

## セットアップ
以降の手順は PowerShell 前提です。

### 0. 事前準備
Node と Python を準備します。

```powershell
mise install
uv python install 3.12.12
```

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

### 3. 環境変数
`.env.example` をコピーして `.env` を作成し、必須項目を設定します。

```
copy .env.example .env
```

### 4. openai-whisper の準備
`tools/openai-whisper` で Python 依存を入れます。

```
uv sync --project .\tools\openai-whisper
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
- `TOKEN` Discord bot token
- `CLIENT_ID` Discord application client ID
- `GUILD_ID` Discord server ID

LLM:
- `LLM_PROVIDER` `ollama` / `gemini` / `openrouter`
- `OLLAMA_LLM_MODEL` モデル名（例: `qwen2.5:3b-instruct`）
- `GEMINI_LLM_MODEL` モデル名（例: `gemini-2.5-flash-lite`）
- `OPENROUTER_LLM_MODEL` モデル名（例: `google/gemma-3-27b-it:free`）
- `GEMINI_API_KEY` Gemini 利用時のみ
- `OPENROUTER_API_KEY` OpenRouter 利用時のみ

STT(openai-whisper):
- `OPENAI_WHISPER_PERSISTENT` `1`/`0`（常駐ワーカーの有効化）
- `OPENAI_WHISPER_WORKERS` 常駐ワーカー数
- `OPENAI_WHISPER_BIN` CLI パス（常駐無効時）
- `OPENAI_WHISPER_UV_BIN` `uv` のパス
- `OPENAI_WHISPER_UV_PROJECT` `tools/openai-whisper` のパス
- `OPENAI_WHISPER_ARGS` 追加引数
- `OPENAI_WHISPER_TIMEOUT_SEC` タイムアウト秒
- `OPENAI_WHISPER_DEBUG` `1` で詳細ログ

その他:
- `PERMITTED_USERS` 現状未使用（将来の運用ガード候補）

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
node "C:\Users\user\AppData\Local\mise\installs\node\20.11.0\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js" rebuild --python "$py"
cd ..\..
```

### テスト
- `npm run test:stt` openai-whisper のSTTテスト
- `npm run test:stt:kotoba` kotoba-whisper のSTTテスト
- `npm run test:ollama` Ollama応答テスト

各テストは `STT_TEST_AUDIO_PATH` などの環境変数が必要です。詳細はテストファイルを参照してください。

## ロードマップ
- 短期: MVP運用の安定化（タイムアウト/リトライ値の調整、ログの整備、セットアップ簡易化）
- 中期: コンポーネント分離（HTTP/IPC）、設定の永続化
- 保留: 複数人同時発話、長期記憶、録音アーカイブ

## ライセンス
`LICENSE` を参照してください。
