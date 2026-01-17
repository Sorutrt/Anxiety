# VC会話 A.I.VOICE Discord Bot 仕様書（SPEC.md）

* Version: 0.2
* Updated: 2026-01-17 (JST)
* 最終ゴール: **VCでの会話（音声→音声）**
* 運用前提: **身内サーバーで1対1**（Bot以外の参加者が2人以上になったら自動停止）
* 既存資産: ReadDiscordByA.I.VOICE（A.I.VOICE読み上げ + VC再生が既に動作）

---

## 1. 目的

Discordのボイスチャンネル内で、参加者（基本1人）の発話に対して A.I.VOICE キャラクターが返答し、**音声としてVCへ再生**して会話する。

テキストチャンネルは運用上の主役ではなく、**デバッグ/ログ/UI補助**として利用する。

---

## 2. スコープ

### 2.1 MVP（必須）

* BotがVCに参加できる（/join /leave）
* ユーザー音声をVCから受信できる
* VADで発話を切り出せる（開始/終了）
* STTでテキスト化できる（日本語）
* LLM等で返答テキスト生成（キャラクター設定適用）
* A.I.VOICEで音声生成し、VCで再生できる
* ターン制御：**案A（Bot発話中は入力無効）**
* 例外/タイムアウト時に定型フォールバック（「ちょい待って…」等）
* テスト時のデバッグログ出力（専用ログチャンネル + level）
* **1対1運用ガード（参加人数監視）**

### 2.2 Out of scope（MVPではやらない）

* 複数人同時発話の正しい処理（優先順位/割込み/混線解決）
* 長期記憶（永続人格学習）
* 音声の保存（録音アーカイブ）

---

## 3. 前提・制約

* 既存実装（ReadDiscordByA.I.VOICE）により、**A.I.VOICE生成〜VC再生**は動いている前提。
* A.I.VOICE制御はWindows依存の可能性がある。
* プライバシー配慮のため、音声は原則保存しない（処理後破棄）。

---

## 4. ユーザー体験

1. ユーザーがVCで話す
2. Botが聞き取り、少し待って返答する
3. Botの返答が A.I.VOICE キャラでVCに流れる
4. テスト時はテキストログに STT/返答/エラーが記録される

---

## 5. アーキテクチャ（推奨）

### 5.1 コンポーネント

* **Discord Bot Core**

  * VC参加/切断
  * 音声受信
  * VAD
  * STT
  * 返答生成（LLM）
  * ターン制御（状態機械）
  * ログ/デバッグ出力
  * 参加人数ガード（1対1）
* **TTS Bridge (A.I.VOICE)**

  * A.I.VOICE操作（テキスト→音声）
  * VC再生（既存資産を最大限流用）

### 5.2 連携方式（初期）

* 初期は同一プロセス内の直接呼び出しでも良い。
* 将来はHTTP/IPCで分離可能な形（インターフェース化）を推奨。

---

## 6. コマンド仕様（Slash）

### 6.1 一般ユーザー

* `/join`：呼び出しユーザーがいるVCへ参加
* `/leave`：VCから退出
* `/vc start`：VC会話モード開始（音声入力を処理）
* `/vc stop`：VC会話モード停止（VCには残ってもよい）
* `/skip`：Botの再生中音声をスキップ
* `/reset`：会話履歴をクリア

### 6.2 管理者/開発者

* `/set character <id|name>`：話者設定
* `/set debug_channel <#channel>`：デバッグログ出力先
* `/debug on|off`
* `/debug level <0|1|2>`：0なし / 1主要 / 2詳細

> 権限はMVPでは管理者のみ。必要なら特定ロール制御へ拡張。

---

## 7. ターン制御（確定：案A）

### 7.1 状態機械

* **IDLE**: 待機（入力ON）
* **LISTENING**: 発話検知〜収録中（入力ON）
* **TRANSCRIBING**: STT中（入力OFF）
* **THINKING**: 返答生成中（入力OFF）
* **SPEAKING**: Bot再生中（入力OFF）
* （任意）**COOLDOWN**: 短いクールダウン（入力OFF）

### 7.2 遷移

1. IDLE → LISTENING：VADが発話開始を検知
2. LISTENING → TRANSCRIBING：無音が `silence_ms` 続いたら発話確定
3. TRANSCRIBING → THINKING：STT成功（テキスト確定）
4. THINKING → SPEAKING：返答確定 → TTS生成 → 再生開始
5. SPEAKING → IDLE：再生完了
6. 任意 → IDLE：`/reset`、例外、タイムアウト、`/skip` など

### 7.3 入力制御（最重要）

* **SPEAKING中は音声入力処理を停止**（自己ループ/二重処理防止）
* Bot発話中にユーザーが喋った音声はMVPでは無視

### 7.4 1対1運用ガード（参加人数監視）

* Botが参加中のVCにおいて、**Bot以外の参加者数が2人以上**になった場合、Botは **VC会話モードを自動停止**する。

  * Botはカウントしない。
  * 自動停止後の状態は `IDLE`（入力OFF）。再開は `/vc start` で手動。
  * 再生中なら即座に停止（`/skip` 相当）。
* 自動停止時の通知

  * 通常運用: VC通知はしない（無言で止める）。
  * debug ON: VCで短い通知を**1回だけ**行ってよい（例：「人数増えたから一旦止めるで」）。

---

## 8. VAD（発話区切り）

### 8.1 パラメータ（初期値）

* `silence_ms`: 700ms（無音継続で発話終了）
* `max_utterance_sec`: 12s（超えたら強制分割）
* `min_utterance_ms`: 400ms（短すぎる発話は捨てる）

---

## 9. STT（Speech-to-Text）

* Input: 発話区間音声（WAV/PCM）
* Output: テキスト（日本語）+ 可能なら信頼度
* 失敗時: 「聞き取れへんかった、もう一回言って」等の定型返答
* タイムアウト: `stt_timeout_sec = 8`

---

## 10. 返答生成（LLM）

* 入力: STTテキスト、会話履歴（直近Nターン）、キャラ定義、制約ルール
* 出力制約

  * 最大 2〜4文 / 目安 300文字
  * 質問は最大1つ
  * @everyone/@here濫用禁止
* 履歴: `context_turns = 10`
* タイムアウト: `llm_timeout_sec = 10`

---

## 11. TTS（A.I.VOICE）

* 入力整形: 句読点/改行を読み上げ向けに調整
* 長さ制御: 目安25秒を超える場合は短縮（将来は要約）
* タイムアウト: `tts_timeout_sec = 12`
* 失敗時: VCは無言（debug時はログで理由）

---

## 12. 「ちょい待って」フォールバック（確定運用）

### 12.1 通常運用（デフォルト）

* VC進捗通知（「ちょい待ってな」等）は基本出さない
* 失敗時のみ短い定型音声でリカバリ

  * 例：「ちょい待って、今調子悪いわ。もう一回お願い」

### 12.2 テスト運用（debug ON）

* VCでの進捗通知は**ターン最初に1回だけ**（STT開始時など）
* 連呼防止: `pendingNoticeSent` をターン内で保持

---

## 13. デバッグ/ログ（確定運用）

* 出力先: `debugChannelId` が設定されている場合のみ
* レベル

  * `0`: なし
  * `1`: 主要イベント
  * `2`: 詳細（状態遷移、処理時間、VAD値、STT信頼度など）

例（Level 1）

* `[STATE] IDLE -> LISTENING`
* `[VAD] end dur=3.2s`
* `[STT] text="..." conf=0.82 time=1.4s`
* `[LLM] time=0.9s`
* `[TTS] time=0.6s`
* `[PLAY] start/end`
* `[GUARD] stop reason=MULTI_MEMBER nonBot=2`

---

## 14. エラー処理・リトライ

* タイムアウト + 例外キャッチで固まりを防ぐ
* リトライは各段階（STT/LLM/TTS）で最大1回

---

## 15. データモデル（案）

### 15.1 GuildConfig

* `guildId: string`
* `defaultCharacterId: string`
* `debugChannelId?: string`
* `debugLevel: 0|1|2`
* `providers: { stt, llm, tts }`

### 15.2 VoiceSession

* `guildId: string`
* `voiceChannelId: string`
* `characterId: string`
* `state: IDLE|LISTENING|TRANSCRIBING|THINKING|SPEAKING`
* `history: Array<{ role: "user"|"assistant", text: string, at: number }>`
* `pendingNoticeSent: boolean`
* `isVcModeRunning: boolean`
* `stopReason?: "MULTI_MEMBER"|"MANUAL"|"ERROR"|...`

### 15.3 Character定義（JSON推奨）

* `id`
* `displayName`
* `systemPrompt`
* `speakingStyle`
* `voicePreset`

---

## 16. プライバシー

* 音声は保存しない（処理後破棄）
* APIキーは `.env` 管理しログに出さない
* debugログはテスト時のみ推奨

---

## 17. MVPテスト

* `/join` → VC参加
* 音声受信 → VAD区切り → STT → 返答生成 → A.I.VOICE → VC再生
* `/skip` が効く
* `/reset` で履歴クリア
* **参加人数がBot以外2人以上**で自動停止し、`/vc start` でのみ再開
* debug on/off, level切替でログ量が変わる

