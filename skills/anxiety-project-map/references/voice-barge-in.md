# VC barge-in メモ

## 目的

Discord VC で、Bot の発話中にユーザー発話で再生を止めて聞き取りへ切り替える実装を触るときの確認メモ。

## まず見るファイル

- `src/voice/voiceService.ts`: 受信開始、録音、割り込み停止、再生キャンセルの中心
- `src/voice/speechIndicatorState.ts`: 発話区間と点灯時間の集計
- `src/voice/playbackBargeIn.ts`: 300ms 到達判定
- `src/state.ts`: `VoiceSession` の状態保持
- `src/constants.ts`: `PLAYBACK_BARGE_IN_MIN_MS` などの閾値

## 実装上の重要ポイント

- `activeUtterances` は「録音中の発話」を表す。STT/LLM/TTS 中まで持ち越さない。
- `VoiceSession.state === "SPEAKING"` は「Bot 応答ターン中」を表す。`AudioPlayer` の実再生中と同義ではない。
- 割り込み条件が「Bot が話している間」なら、`AudioPlayer` の状態だけでなく `VoiceSession.state` も見る。
- 割り込み成立後は `stopPlayback()` だけでなく、古い応答ターンの WAV 再生開始も止める。
- 旧ターンの終了処理で新ターンの `currentUtteranceId` を消さないように、`IDLE` リセットは期待する utterance id と一致したときだけ行う。

## 今回ハマった典型バグ

- 録音終了後も `activeUtterances` を残し、次の発話開始が前発話の継続として吸われる。
- `SPEAKING` と実再生中を同一視して、TTS 生成中の割り込み開始を取り逃がす。
- `stopPlayback()` は呼べても、TTS 完了後に古い WAV がそのまま再生される。
- 旧ターンの finally やリセット処理が、新ターンの `LISTENING` を `IDLE` に戻してしまう。

## デバッグ確認ポイント

- `indicator on` / `indicator off` が出ているか
- `Discordのボイスが入ってきた` が Bot 発話中にも出ているか
- `PLAYBACK -> LISTENING` が出ているか
- `currentUtteranceId` が割り込み時に新しい値へ切り替わっているか
- 古い TTS 完了後に `expectedUtteranceId` 不一致で再生が抑止されているか

## 修正時の指針

1. 受信開始時に「録音中の発話」と「Bot 応答ターン」を分けて考える。
2. 録音終了時点で `activeUtterances` を解放し、後段処理は `VoiceSession` で追う。
3. 割り込み停止は 300ms 判定を純粋関数に寄せ、テストで固定する。
4. ターン終了処理は `currentUtteranceId` 一致時だけ状態を戻す。
