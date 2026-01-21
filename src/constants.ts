// 緑ランプの合計点灯時間がこの値以下なら発話として扱わない。
export const SPEECH_INDICATOR_MIN_MS = 800;
// 消灯後、この時間以内の再点灯は同一発話として扱う。
export const SPEECH_GAP_MS = 500;
// 録音が長引いたときに強制終了する最大秒数。
export const MAX_UTTERANCE_SEC = 12;
// 録音データの最小長（短すぎる録音は破棄）。
export const MIN_UTTERANCE_MS = 800;

// STT処理のタイムアウト秒数。
export const STT_TIMEOUT_SEC = 8;
// LLM処理のタイムアウト秒数。
export const LLM_TIMEOUT_SEC = 10;
// TTS処理のタイムアウト秒数。
export const TTS_TIMEOUT_SEC = 12;

// 会話履歴として保持する往復ターン数。
export const CONTEXT_TURNS = 10;
// LLMの返答を短く保つための最大文字数。
export const MAX_RESPONSE_CHARS = 300;

// デバッグ通知の読み上げ文。
export const DEBUG_NOTICE_TEXT = "ちょい待ってな";
// STT失敗時に返す文。
export const STT_FALLBACK_TEXT = "聞き取れへんかった、もう一回言って";
// 想定外の失敗時に返す文。
export const GENERAL_FALLBACK_TEXT = "ちょい待って、今調子悪いわ。もう一回お願い";
// VC会話モード停止理由が複数人のときの通知文。
export const MULTI_MEMBER_NOTICE_TEXT = "人数増えたから一旦止めるで";
