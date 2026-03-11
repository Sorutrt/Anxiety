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

## Discord VC の barge-in

1. Bot 応答ターン中でも、ユーザーの `speaking start` を受けたら provisional に録音を開始する。
2. ユーザー発話の点灯時間が `PLAYBACK_BARGE_IN_MIN_MS` 以上になったら Bot の再生を止める。
3. 割り込み成立後は `VoiceSession` を `LISTENING` に切り替え、新しい `currentUtteranceId` を採番する。
4. 録音終了後は `activeUtterances` を解放し、STT/LLM/TTS 中の次発話を新規ターンとして受け付ける。
5. 古い応答ターンの TTS が後から完了しても、`currentUtteranceId` が変わっていれば再生しない。

## エラー/タイムアウトの扱い

- STT/LLM/TTS は `retryOnce` や `withTimeout` で再試行・タイムアウト制御する。
- 失敗時はフォールバック文言を返して状態をリセットする。
