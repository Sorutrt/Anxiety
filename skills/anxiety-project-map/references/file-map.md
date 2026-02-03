# ファイル対応マップ

## まず見るべき起点

- `src/voice/voiceService.ts`: 音声受信、録音、STT→LLM→TTSの中心フロー
- `src/state.ts`: ギルド設定・セッション管理
- `src/types.ts`: 主要な型定義
- `src/constants.ts`: タイムアウトや閾値

## STT (Speech to Text)

- `src/stt/openaiWhisper.ts`: STTワーカープール、環境変数、CLI/常駐の切替
- `tools/openai-whisper/`: Python側のCLI/サーバー（実体）
- `skills/openai-whisper/`: openai-whisperの詳細変更時に参照

## LLM

- `src/llm/index.ts`: プロバイダ切替とフォールバック
- `src/llm/common.ts`: システムプロンプト/メッセージ組み立て/リトライ
- `src/llm/gemini.ts`: Gemini実装
- `src/llm/openrouter.ts`: OpenRouter実装
- `src/llm/ollama.ts`: Ollama実装
- `src/llm/ollamaManager.ts`: Ollamaの起動/停止管理
- `src/llm/ollamaConfig.ts`: Ollamaのパス・URL

## TTS (A.I.VOICE)

- `src/aivoice.ts`: A.I.VOICE Editor API 連携（音声生成）
- `voice/`: 生成WAVの出力先
- `data/characters.json`: voicePreset や話者定義
- `src/characters.ts`: キャラクターの読み込みと検索
- `README.md`: A.I.VOICE Editor の設定手順

## コマンド追加

- `src/commands/`: 新規コマンドファイルを追加
- `src/main.ts`: ハンドラ登録（Mapに追加）
- `src/deployCommands.ts`: デプロイ対象リストへ追加
- `README.md`: コマンド一覧の更新

## 起動/エントリ

- `src/main.ts`: Bot起動、イベント登録、STT初期化

## テスト/デバッグ

- `src/stt/openaiWhisper.test.ts`: STTテスト
- `src/llm/*.test.ts`: LLM周りのテスト
- `src/voice/*.test.ts`: 音声周りのテスト
