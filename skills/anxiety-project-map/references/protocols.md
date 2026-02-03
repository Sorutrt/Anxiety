# プロトコル/データフロー

## STT → LLM の流れ

1. `src/voice/voiceService.ts` が Discord VC 音声を受信する。
2. `SpeechIndicatorState` で発話境界を判定し、録音を WAV として保存する。
3. `src/stt/openaiWhisper.ts` の `transcribeAudio` が STT を実行する。
4. `src/voice/sttText.ts` の `normalizeSttText` で空文字を判定する。
5. `src/state.ts` の `VoiceSession` を更新し、状態は `IDLE → LISTENING → TRANSCRIBING → THINKING` と進む。
6. `generateReplyFromLlm` が `src/llm/index.ts` の `generateReply` を呼び、LLM応答を生成する。

## LLM → A.I.VOICE の流れ

1. `sanitizeReply` で返答テキストを整形する。
2. `VoiceSession` を `SPEAKING` に更新する。
3. `speakText` が `src/aivoice.ts` の `textToSaveWav` を呼び、A.I.VOICE Editor API で WAV を生成する。
4. `findLatestWavFileAfter` で生成された最新 WAV を特定する。
5. `playAudioFileForGuild` が `@discordjs/voice` で VC に再生する。
6. 再生後に生成ファイルを削除し、状態を `IDLE` に戻す。

## 主要な状態遷移

- `IDLE → LISTENING → TRANSCRIBING → THINKING → SPEAKING → IDLE`

## エラー/タイムアウトの扱い

- STT/LLM/TTS は `retryOnce` や `withTimeout` で再試行・タイムアウト制御する。
- 失敗時はフォールバック文言を返して状態をリセットする。
