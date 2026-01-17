# ReadDiscordByA.I.VOICE
## 🎤 これは何？
- Discord読み上げbot
- A.I.VOICEによる読み上げ（別途A.I.VOICE Editorが必要です）
- ローカルで動く

## 🔌 クイックスタート
### 0. 事前準備（mise / uv 前提）
Node は `mise`、Python は `uv` で管理します。

- Node 20 を `mise` で用意
```
mise install
```

- Python は `uv` で用意（例: 3.12系）
```
uv python install 3.12.12
```

以降の手順は PowerShell 前提です。

### 1. botを作成する
[Discord Developer Portal](https://discord.com/developers/applications)からbotを作成してください。
botの許可設定はこんな感じ
![許可設定画像](./img/readme/botperm.png)
- SCOPES
  - applications.commands
  - bot  
- BOT PERMISSIONS
  - TEXT PERMISSIONS
    - Send Messages
  - VOICE PERMISSIONS
    - Connect
    - Speak

Privileged Gateway Intents で以下を有効化してください
- MESSAGE CONTENT INTENT
- SERVER MEMBERS INTENT

できたURLにアクセスし、サーバーに招待する

### 2. ローカルで動作させる
リポジトリをクローンしてください
```
git clone https://github.com/Sorutrt/ReadDiscordByA.I.VOICE.git
```
`.env.example`を指定のとおりに書き換え、`.env`にリネームしてください  
`GEMINI_API_KEY` と `KOTOBA_WHISPER_BIN` も設定してください  
`KOTOBA_WHISPER_BIN` の例: `.\tools\kotoba-whisper\kotoba-whisper.cmd`

npmパッケージをインストールします
```
npm i
```
を実行

#### 依存のビルド注意（Windows）
`winax` がネイティブビルドを行うため、`node-gyp` 用に `uv` の Python を渡します。

```
$py = "C:\Users\user\AppData\Roaming\uv\python\cpython-3.12.12-windows-x86_64-none\python.exe"
$env:PYTHON = $py
$env:npm_config_python = $py
$env:Path = (Split-Path $py) + ";" + $env:Path

cd .\node_modules\winax
node "C:\Users\user\AppData\Local\mise\installs\node\20.11.0\node_modules\npm\node_modules\node-gyp\bin\node-gyp.js" rebuild --python "$py"
cd ..\..
```

`voice` ディレクトリが必要です（無いと起動時に落ちます）。
```
New-Item -ItemType Directory -Path voice
```

`kotoba-whisper` CLI は `tools/kotoba-whisper/` を参照してください。
`uv sync --project .\tools\kotoba-whisper` を実行して依存を用意します。
キャラクター定義は `data/characters.json` を編集してください。

`opusscript` が無いと音声再生で落ちるため、入れておきます。
```
npm i opusscript
```

```
npx tsx .\src\deployCommands.ts
```
でコマンドを登録します

手っ取り早く動かすには
```
npx tsx .\src\main.ts
```
jsにコンパイルして動かすには
```
tsc -p .
node .\dist\main.js
```

これでbotの起動が完了しました！

### A.I.VOICE Editor 設定
#### プロジェクト設定
- 音声ファイル保存
  - ファイル分割: 1 つのファイルに書き出す
  - ファイル形式: WAVE 44100Hz 16bit PCM
  - テキストファイル
    - ☑テキストファイルを音声ファイルと一緒に保存する
      - 文字コード: UTF-8
    - □ 音素情報ファイルを音声ファイルと一緒に保存する
  - 音声ファイルパスの指定方法
    - ◉ ファイル命名規則を指定して選択する
    - フォルダー：プロジェクト直下にある `./voice/` をフォルダに指定します
    - 命名規則：`{Text} `
#### 環境設定
- □ 音声保存時に毎回設定を表示する
- □ メッセージ表示レベル: 簡潔

## 🔊 使い方
`/join`でユーザーのVCに入ります  
`/leave` でVCから退出します  
`/vc start` でVC会話を開始します  
`/vc stop` で会話を停止します  
`/skip` で再生中の音声をスキップします  
`/reset` で会話履歴をクリアします  
`/set character <id|name>` で話者を切り替えます  
`/set debug_channel <#channel>` でデバッグログを出力します  
`/debug on|off` / `/debug level <0|1|2>` でログ量を調整します  
テキスト読み上げは従来通りメッセージ送信で行えます

## 🧱 開発メモ 
### コンパイル等(npm-scriptsがうまくいかない時用)
コマンドの登録
```
npx tsx .\src\deployCommands.ts
```

動作テスト
```
npx tsx .\src\main.ts
```

## その他 
質問などあればIssuesに投げてください

