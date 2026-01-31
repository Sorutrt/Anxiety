import {
  AudioPlayer,
  AudioPlayerStatus,
  EndBehaviorType,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import prism from "prism-media";
import {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import {
  CONTEXT_TURNS,
  DEBUG_NOTICE_TEXT,
  GENERAL_FALLBACK_TEXT,
  MAX_RESPONSE_CHARS,
  MAX_UTTERANCE_SEC,
  MIN_UTTERANCE_MS,
  MULTI_MEMBER_NOTICE_TEXT,
  SPEECH_GAP_MS,
  SPEECH_INDICATOR_MIN_MS,
  STT_FALLBACK_TEXT,
  TTS_TIMEOUT_SEC,
} from "../constants";
import { getCharacters } from "../characters";
import { getGuildConfig, getVoiceSession, updateVoiceSession } from "../state";
import type { ConversationTurn } from "../types";
import type { SpeechIndicatorResult } from "./speechIndicatorState";
import { textToSaveWav } from "../aivoice";
import { generateReply } from "../llm";
import { ensureOllamaRunning, stopOllamaServer } from "../llm/ollamaManager";
import { transcribeAudio } from "../stt/openaiWhisper";
import { retryOnce, withTimeout } from "../utils/async";
import { SpeechIndicatorState } from "./speechIndicatorState";
import { normalizeSttText } from "./sttText";

const audioPlayers = new Map<string, AudioPlayer>();
const receiverInitialized = new Set<string>();
const require = createRequire(import.meta.url);
// 緑ランプの点灯/消灯に基づく発話判定と録音状態をまとめて管理する。
type ReceiverStream = NodeJS.ReadableStream & { destroy: () => void };
type RecordingContext = {
  utteranceId: string;
  userId: string;
  startedAt: number;
  chunks: Buffer[];
  receiverStream: ReceiverStream;
  decoder: prism.opus.Decoder;
  maxTimer: ReturnType<typeof setTimeout>;
  finished: boolean;
};
type ActiveUtterance = {
  userId: string;
  utteranceId: string;
  silenceTimer?: ReturnType<typeof setTimeout>;
  indicatorState: SpeechIndicatorState;
  indicatorResult?: SpeechIndicatorResult;
  recording: RecordingContext;
};
const activeUtterances = new Map<string, ActiveUtterance>();
const recordingDir = path.resolve(process.cwd(), "voice", "recorded");
const opusModuleLogState = { logged: false };

// Opus実装の種類を1回だけログして、フォールバック時の原因調査を容易にする。
function logOpusModuleType(): void {
  if (opusModuleLogState.logged) {
    return;
  }
  opusModuleLogState.logged = true;
  const decoderType = prism.opus.Decoder.type;
  if (decoderType === "@discordjs/opus") {
    console.log(`[VOICE] Opus module: ${decoderType}`);
    return;
  }
  console.warn(
    `[VOICE] Opus module fallback: ${decoderType ?? "unknown"} (expected @discordjs/opus).`
  );
  try {
    require("@discordjs/opus");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[VOICE] @discordjs/opus load error: ${message}`);
  }
}

function ensureRecordingDir(): void {
  if (!fs.existsSync(recordingDir)) {
    fs.mkdirSync(recordingDir, { recursive: true });
  }
}

export function getOrCreateAudioPlayer(guildId: string): AudioPlayer {
  const existing = audioPlayers.get(guildId);
  if (existing) {
    return existing;
  }

  const player = createAudioPlayer();
  audioPlayers.set(guildId, player);
  return player;
}

export function getAudioPlayer(guildId: string): AudioPlayer | undefined {
  return audioPlayers.get(guildId);
}

export async function joinVoiceChannelFromInteraction(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const { guild, member } = interaction;
  if (!guild) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }
  if (!(member instanceof GuildMember)) {
    await interaction.reply("このコマンドはギルドメンバーに対して実行できます。");
    return;
  }

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.reply("ボイスチャンネルに参加してから再度試してください。");
    return;
  }

  await interaction.deferReply();
  const config = getGuildConfig(guild.id);
  if (config.providers.llm.trim().toLowerCase().startsWith("ollama:")) {
    try {
      await ensureOllamaRunning();
    } catch (error) {
      console.error("Ollama起動エラー:", error);
      await interaction.editReply(
        "Ollamaの起動に失敗しました。tools/ollama/install.ps1 の実行とモデルの取得を確認してください。"
      );
      return;
    }
  }

  const existingConnection = getVoiceConnection(guild.id);
  const connection =
    existingConnection && existingConnection.joinConfig.channelId === voiceChannel.id
      ? existingConnection
      : joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: voiceChannel.guild.id,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: false,
        });

  const session = getVoiceSession(guild.id, voiceChannel.id);
  getOrCreateAudioPlayer(guild.id);
  setupReceiver(interaction.client, guild.id, connection);

  const nonBotMembers = countNonBotMembers(voiceChannel);
  if (nonBotMembers >= 2) {
    await stopForMultiMember(interaction.client, guild.id, nonBotMembers);
    await interaction.editReply(
      `${voiceChannel.name} チャンネルに接続しました。VC会話モードは1対1のときのみ開始できます。人数が1人になったら /join で再開してください。`
    );
    return;
  }

  const wasRunning = session.isVcModeRunning;
  if (!wasRunning) {
    updateVoiceSession(guild.id, (current) => ({
      ...current,
      isVcModeRunning: true,
      stopReason: undefined,
    }));
  }

  const statusMessage = wasRunning
    ? "VC会話モードは既に開始しています。"
    : "VC会話モードを開始します。";
  await interaction.editReply(`${voiceChannel.name} チャンネルに接続しました。${statusMessage}`);
}

export async function leaveVoiceChannel(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    await interaction.reply("ボイスチャンネルに接続していません。");
    return;
  }

  updateVoiceSession(guildId, (session) => ({
    ...session,
    state: "IDLE",
    isVcModeRunning: false,
    stopReason: "MANUAL",
    currentSpeakerId: undefined,
    currentUtteranceId: undefined,
  }));
  stopActiveUtterance(guildId);
  connection.destroy();
  receiverInitialized.delete(guildId);
  await stopOllamaServer();

  await interaction.reply("ボイスチャンネルから退出しました。");
}

export async function skipPlayback(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }

  const player = getAudioPlayer(guildId);
  if (!player) {
    await interaction.reply("再生中の音声はありません。");
    return;
  }

  player.stop(true);
  updateVoiceSession(guildId, (session) => ({
    ...session,
    state: "IDLE",
    currentSpeakerId: undefined,
    currentUtteranceId: undefined,
  }));

  await interaction.reply("再生をスキップしました。");
}

export async function resetHistory(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }

  updateVoiceSession(guildId, (session) => ({
    ...session,
    history: [],
  }));

  await interaction.reply("会話履歴をクリアしました。");
}

export function handleVoiceStateUpdate(client: Client, state: VoiceState): void {
  const guildId = state.guild.id;
  const session = getVoiceSession(guildId);
  if (!session.voiceChannelId) {
    return;
  }

  const channel = state.guild.channels.cache.get(session.voiceChannelId);
  if (!channel || !channel.isVoiceBased()) {
    return;
  }

  const nonBotMembers = countNonBotMembers(channel);
  if (nonBotMembers >= 2 && session.isVcModeRunning) {
    void stopForMultiMember(client, guildId, nonBotMembers);
  }
}

function setupReceiver(client: Client, guildId: string, connection: VoiceConnection): void {
  if (receiverInitialized.has(guildId)) {
    console.log(`[VOICE] receiver already initialized guild=${guildId}`);
    return;
  }

  receiverInitialized.add(guildId);
  console.log(`[VOICE] receiver initialized guild=${guildId}`);
  connection.receiver.speaking.on("start", (userId) => {
    console.log(`[VOICE] indicator on guild=${guildId} user=${userId}`);
    void handleSpeechStart(client, guildId, userId, connection);
  });
  connection.receiver.speaking.on("end", (userId) => {
    console.log(`[VOICE] indicator off guild=${guildId} user=${userId}`);
    handleSpeechEnd(guildId, userId);
  });
}

function countNonBotMembers(channel: VoiceBasedChannel): number {
  return channel.members.filter((member) => !member.user.bot).size;
}

async function stopForMultiMember(
  client: Client,
  guildId: string,
  nonBotMembers: number
): Promise<void> {
  const config = getGuildConfig(guildId);
  updateVoiceSession(guildId, (session) => ({
    ...session,
    isVcModeRunning: false,
    state: "IDLE",
    stopReason: "MULTI_MEMBER",
    currentSpeakerId: undefined,
    currentUtteranceId: undefined,
  }));
  stopActiveUtterance(guildId);
  stopPlayback(guildId);
  await logDebug(client, guildId, 1, `[GUARD] stop reason=MULTI_MEMBER nonBot=${nonBotMembers}`);

  if (config.debugLevel > 0) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
      await speakText(client, guildId, connection, MULTI_MEMBER_NOTICE_TEXT);
    }
  }
  await stopOllamaServer();
}

async function handleSpeechStart(
  client: Client,
  guildId: string,
  userId: string,
  connection: VoiceConnection
): Promise<void> {
  const session = getVoiceSession(guildId);
  if (!session.isVcModeRunning) {
    console.log(`[VOICE] start ignored: vc mode off guild=${guildId} user=${userId}`);
    return;
  }

  const active = activeUtterances.get(guildId);
  if (active) {
    if (active.userId !== userId) {
      console.log(
        `[VOICE] start ignored: active user mismatch guild=${guildId} user=${userId} active=${active.userId}`
      );
      return;
    }
    if (active.silenceTimer) {
      clearTimeout(active.silenceTimer);
      active.silenceTimer = undefined;
    }
    active.indicatorState.onIndicatorOn(Date.now());
    return;
  }

  if (session.state !== "IDLE") {
    console.log(
      `[VOICE] start ignored: session busy guild=${guildId} user=${userId} state=${session.state}`
    );
    return;
  }

  if (userId === client.user?.id) {
    console.log(`[VOICE] start ignored: self guild=${guildId} user=${userId}`);
    return;
  }

  const memberPromise = client.users.fetch(userId).catch(() => null);

  console.log(`[VOICE] Discordのボイスが入ってきた guild=${guildId} user=${userId}`);

  const voiceChannel = connection.joinConfig.channelId
    ? connection.joinConfig.channelId
    : session.voiceChannelId;
  const now = Date.now();
  const utteranceId = `${userId}-${now}`;
  updateVoiceSession(guildId, (current) => ({
    ...current,
    voiceChannelId: voiceChannel,
    pendingNoticeSent: false,
    state: "LISTENING",
    currentSpeakerId: userId,
    currentUtteranceId: utteranceId,
  }));

  const recording = startRecording(client, guildId, userId, utteranceId, connection);
  if (!recording) {
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
    return;
  }
  const indicatorState = new SpeechIndicatorState({
    minOnMs: SPEECH_INDICATOR_MIN_MS,
    gapMs: SPEECH_GAP_MS,
  });
  indicatorState.start(now);
  activeUtterances.set(guildId, {
    userId,
    utteranceId,
    indicatorState,
    recording,
  });
  void logDebug(client, guildId, 1, `[STATE] IDLE -> LISTENING`);

  const member = await memberPromise;
  if (member?.bot) {
    const current = getVoiceSession(guildId);
    if (current.currentUtteranceId !== utteranceId) {
      return;
    }
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
    stopActiveUtterance(guildId, utteranceId);
  }
}

// 緑ランプの消灯で無音判定を進め、発話の区切りタイマーを更新する。
function handleSpeechEnd(guildId: string, userId: string): void {
  const active = activeUtterances.get(guildId);
  if (!active || active.userId !== userId) {
    return;
  }

  if (active.silenceTimer) {
    clearTimeout(active.silenceTimer);
  }
  const now = Date.now();
  const silenceDeadline = active.indicatorState.onIndicatorOff(now);
  if (!silenceDeadline) {
    return;
  }
  active.silenceTimer = setTimeout(() => {
    handleSilenceTimeout(guildId, active.utteranceId);
  }, Math.max(0, silenceDeadline - now));
}

// 無音状態が一定時間続いた場合に発話終了を確定する。
function handleSilenceTimeout(guildId: string, utteranceId: string): void {
  const active = activeUtterances.get(guildId);
  if (!active || active.utteranceId !== utteranceId) {
    return;
  }
  const now = Date.now();
  if (!active.indicatorState.shouldEnd(now)) {
    return;
  }
  stopActiveUtterance(guildId, utteranceId, now);
}

// 発話終了を確定するために録音ストリームを終了させる。
function stopActiveUtterance(guildId: string, utteranceId?: string, endedAt?: number): void {
  const active = activeUtterances.get(guildId);
  if (!active) {
    return;
  }
  if (utteranceId && active.utteranceId !== utteranceId) {
    return;
  }
  if (active.silenceTimer) {
    clearTimeout(active.silenceTimer);
    active.silenceTimer = undefined;
  }
  active.indicatorResult = active.indicatorState.complete(endedAt ?? Date.now());
  if (!active.recording.finished) {
    // 手動終了時にデコーダを確実に閉じて finalize を発火させる。
    active.recording.receiverStream.unpipe(active.recording.decoder);
    active.recording.decoder.end();
    active.recording.receiverStream.destroy();
  }
}

// 進行中の発話状態をクリアしてタイマーリークを防ぐ。
function clearActiveUtterance(guildId: string, utteranceId?: string): void {
  const active = activeUtterances.get(guildId);
  if (!active) {
    return;
  }
  if (utteranceId && active.utteranceId !== utteranceId) {
    return;
  }
  if (active.silenceTimer) {
    clearTimeout(active.silenceTimer);
  }
  activeUtterances.delete(guildId);
}

// 音声収録〜WAV保存までをまとめて行う。
function startRecording(
  client: Client,
  guildId: string,
  userId: string,
  utteranceId: string,
  connection: VoiceConnection
): RecordingContext | null {
  const session = getVoiceSession(guildId);
  if (session.currentUtteranceId !== utteranceId) {
    return null;
  }

  ensureRecordingDir();

  const receiverStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.Manual,
    },
  });
  const decoder = new prism.opus.Decoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  });
  logOpusModuleType();
  const chunks: Buffer[] = [];
  const startedAt = Date.now();
  const maxTimer = setTimeout(
    () => stopActiveUtterance(guildId, utteranceId, Date.now()),
    MAX_UTTERANCE_SEC * 1000
  );
  const recording: RecordingContext = {
    utteranceId,
    userId,
    startedAt,
    chunks,
    receiverStream,
    decoder,
    maxTimer,
    finished: false,
  };

  // 受信・デコード異常時に録音ストリームを安全に停止する。
  const abortRecording = (message: string, error: unknown) => {
    if (recording.finished) {
      return;
    }
    recording.finished = true;
    clearTimeout(recording.maxTimer);
    try {
      receiverStream.unpipe(decoder);
    } catch {
      // 既に解除済みの場合は無視する。
    }
    decoder.destroy();
    receiverStream.destroy();
    console.error(message, error);
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
    clearActiveUtterance(guildId, utteranceId);
  };

  receiverStream.pipe(decoder);

  decoder.on("data", (chunk) => {
    chunks.push(chunk as Buffer);
  });

  const finalizeOnce = () => {
    if (recording.finished) {
      return;
    }
    recording.finished = true;
    clearTimeout(recording.maxTimer);
    const durationMs = Date.now() - recording.startedAt;
    void finalizeRecording(client, guildId, utteranceId, durationMs, chunks);
  };

  decoder.on("end", finalizeOnce);
  decoder.on("close", finalizeOnce);
  receiverStream.on("end", finalizeOnce);
  receiverStream.on("close", finalizeOnce);

  receiverStream.on("error", (error) => {
    abortRecording("音声受信エラー:", error);
  });

  decoder.on("error", (error) => {
    abortRecording("Opusのデコードに失敗しました:", error);
  });

  return recording;
}

async function finalizeRecording(
  client: Client,
  guildId: string,
  utteranceId: string,
  durationMs: number,
  chunks: Buffer[]
): Promise<void> {
  const session = getVoiceSession(guildId);
  const active = activeUtterances.get(guildId);
  const indicatorResult =
    active?.utteranceId === utteranceId
      ? (active.indicatorResult ?? active.indicatorState.complete(Date.now()))
      : null;
  const hasValidSpeech = indicatorResult?.isValid ?? false;
  if (session.currentUtteranceId !== utteranceId) {
    clearActiveUtterance(guildId, utteranceId);
    return;
  }

  if (!hasValidSpeech || durationMs < MIN_UTTERANCE_MS || chunks.length === 0) {
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
    const reason = !hasValidSpeech ? "indicator" : "duration";
    const totalOnMs = indicatorResult?.totalOnMs ?? 0;
    await logDebug(
      client,
      guildId,
      2,
      `[SPEECH] drop dur=${durationMs}ms on=${totalOnMs}ms reason=${reason}`
    );
    clearActiveUtterance(guildId, utteranceId);
    return;
  }

  updateVoiceSession(guildId, (current) => ({
    ...current,
    state: "TRANSCRIBING",
  }));
  await logDebug(client, guildId, 1, `[STATE] LISTENING -> TRANSCRIBING`);
  await logDebug(client, guildId, 2, `[SPEECH] end dur=${(durationMs / 1000).toFixed(2)}s`);

  const wavPath = path.join(recordingDir, `${utteranceId}.wav`);
  const wavBuffer = createWavBuffer(Buffer.concat(chunks), 48000, 2);
  await fs.promises.writeFile(wavPath, wavBuffer);
  console.log(`[VOICE] 音声の保存が完了した path=${wavPath} durMs=${durationMs}`);

  try {
    await processUtterance(client, guildId, wavPath, utteranceId);
  } finally {
    await fs.promises.unlink(wavPath).catch(() => undefined);
    clearActiveUtterance(guildId, utteranceId);
  }
}

function createWavBuffer(pcmData: Buffer, sampleRate: number, channels: number): Buffer {
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmData.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmData.copy(buffer, 44);
  return buffer;
}

// STT〜LLM〜TTSのパイプラインを順に実行する。
async function processUtterance(
  client: Client,
  guildId: string,
  wavPath: string,
  utteranceId: string
): Promise<void> {
  const session = getVoiceSession(guildId);
  if (!session.isVcModeRunning || session.currentUtteranceId !== utteranceId) {
    return;
  }

  await maybeSendDebugNotice(client, guildId);

  let text: string | null = null;
  let sttFailed = false;
  const sttStart = Date.now();
  try {
    console.log(`[STT] 音声をSTTに投げた path=${wavPath}`);
    const rawText = await transcribeAudio(wavPath, guildId);
    text = normalizeSttText(rawText);
    console.log(`[STT] 認識結果 text="${text ?? ""}"`);
    console.log(`[PIPELINE] STT=done LLM=waiting TTS=waiting`);
  } catch (error) {
    sttFailed = true;
    console.error("STTエラー:", error);
  }
  const sttTime = Date.now() - sttStart;

  if (sttFailed) {
    await speakFallback(client, guildId, STT_FALLBACK_TEXT);
    resetSessionAfterTurn(guildId);
    return;
  }

  if (text === null) {
    resetSessionAfterTurn(guildId);
    return;
  }

  const userText = text;
  if (!isSessionActive(guildId, utteranceId)) {
    resetSessionAfterTurn(guildId);
    return;
  }

  updateVoiceSession(guildId, (current) => {
    const userHistory: ConversationTurn[] = [
      ...current.history,
      { role: "user" as const, text: userText, at: Date.now() },
    ].slice(-CONTEXT_TURNS * 2);
    return {
      ...current,
      state: "THINKING",
      history: userHistory,
    };
  });
  await logDebug(client, guildId, 1, `[STATE] TRANSCRIBING -> THINKING`);
  await logDebug(client, guildId, 1, `[STT] text="${userText}"`);
  await logDebug(client, guildId, 2, `[STT] time=${sttTime}ms`);

  const llmStart = Date.now();
  console.log(`[PIPELINE] STT=done LLM=running TTS=waiting`);
  const reply = await generateReplyFromLlm(guildId, userText);
  const llmTime = Date.now() - llmStart;
  if (!reply) {
    await speakFallback(client, guildId, GENERAL_FALLBACK_TEXT);
    resetSessionAfterTurn(guildId);
    return;
  }
  const replyText = reply;
  console.log(`[PIPELINE] STT=done LLM=done TTS=running`);
  await logDebug(client, guildId, 2, `[LLM] time=${llmTime}ms`);

  if (!isSessionActive(guildId, utteranceId)) {
    resetSessionAfterTurn(guildId);
    return;
  }

  updateVoiceSession(guildId, (current) => {
    const assistantHistory: ConversationTurn[] = [
      ...current.history,
      { role: "assistant" as const, text: replyText, at: Date.now() },
    ].slice(-CONTEXT_TURNS * 2);
    return {
      ...current,
      state: "SPEAKING",
      history: assistantHistory,
    };
  });
  await logDebug(client, guildId, 1, `[STATE] THINKING -> SPEAKING`);

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    resetSessionAfterTurn(guildId);
    return;
  }

  await speakText(client, guildId, connection, replyText);
  console.log(`[PIPELINE] STT=done LLM=done TTS=done`);
  resetSessionAfterTurn(guildId);
}

async function generateReplyFromLlm(guildId: string, userText: string): Promise<string | null> {
  const characters = getCharacters();
  const session = getVoiceSession(guildId);
  const character =
    characters.find((item) => item.id === session.characterId) ?? characters[0];
  if (!character) {
    return null;
  }

  const config = getGuildConfig(guildId);
  const history = session.history.slice(-CONTEXT_TURNS * 2);

  try {
    const reply = await generateReply({
      guildId,
      model: config.providers.llm,
      character,
      history,
      userText,
    });
    return sanitizeReply(reply);
  } catch (error) {
    console.error("LLMエラー:", error);
    return null;
  }
}

function sanitizeReply(reply: string): string {
  let text = reply.replace(/@everyone|@here/g, "");
  text = text.replace(/\s+/g, " ").trim();
  text = limitQuestionMarks(text);
  text = limitSentenceCount(text, 4);
  if (text.length > MAX_RESPONSE_CHARS) {
    text = `${text.slice(0, MAX_RESPONSE_CHARS)}…`;
  }
  return text;
}

function limitQuestionMarks(text: string): string {
  let count = 0;
  return text.replace(/[?？]/g, (match) => {
    count += 1;
    return count > 1 ? "。" : match;
  });
}

function limitSentenceCount(text: string, maxSentences: number): string {
  const sentences = text.match(/[^。！？]+[。！？]?/g);
  if (!sentences || sentences.length <= maxSentences) {
    return text;
  }
  return sentences.slice(0, maxSentences).join("").trim();
}

async function speakFallback(client: Client, guildId: string, text: string): Promise<void> {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    return;
  }

  await speakText(client, guildId, connection, text);
}

async function speakText(
  client: Client,
  guildId: string,
  connection: VoiceConnection,
  text: string
): Promise<void> {
  const characters = getCharacters();
  const session = getVoiceSession(guildId);
  const character =
    characters.find((item) => item.id === session.characterId) ?? characters[0];
  if (!character) {
    return;
  }

  const ttsStart = Date.now();
  await logDebug(client, guildId, 1, `[TTS] start`);
  const voiceDir = path.resolve(process.cwd(), "voice");
  const formattedText = formatTtsText(text);
  try {
    await retryOnce(() =>
      withTimeout(
        () => textToSaveWav(formattedText, voiceDir, character.voicePreset),
        TTS_TIMEOUT_SEC * 1000,
        "TTSの生成がタイムアウトしました。"
      )
    );
  } catch (error) {
    console.error("TTSエラー:", error);
    return;
  }

  const wavFile = findLatestWavFileAfter(voiceDir, ttsStart);
  if (!wavFile) {
    return;
  }
  try {
    await logDebug(client, guildId, 1, `[PLAY] start`);
    await playAudioFileForGuild(guildId, connection, wavFile);
  } catch (error) {
    console.error("音声再生エラー:", error);
  } finally {
    await deleteGeneratedFiles(wavFile);
  }
  await logDebug(client, guildId, 1, `[PLAY] end`);
  await logDebug(client, guildId, 1, `[TTS] end`);
  await logDebug(client, guildId, 2, `[TTS] time=${Date.now() - ttsStart}ms`);
}

// TTS開始時刻以降に作られたWAVのうち最新のものを取得する。
export function findLatestWavFileAfter(dir: string, sinceMs: number): string | null {
  const files = fs
    .readdirSync(dir)
    .filter((filename) => filename.toLowerCase().endsWith(".wav"));
  if (files.length === 0) {
    return null;
  }
  const latest = files
    .map((filename) => {
      const resolved = path.resolve(dir, filename);
      const stat = fs.statSync(resolved);
      return stat.isFile() ? { path: resolved, mtime: stat.mtimeMs } : null;
    })
    .filter((item): item is { path: string; mtime: number } => item !== null)
    .filter((item) => item.mtime >= sinceMs)
    .sort((a, b) => a.mtime - b.mtime)
    .pop();
  return latest?.path ?? null;
}

function formatTtsText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/。{2,}/g, "。").trim();
}

async function deleteGeneratedFiles(wavPath: string): Promise<void> {
  await fs.promises.unlink(wavPath).catch(() => undefined);
  const txtPath = wavPath.replace(/\.wav$/i, ".txt");
  await fs.promises.unlink(txtPath).catch(() => undefined);
}

export async function playAudioFileForGuild(
  guildId: string,
  connection: VoiceConnection,
  filePath: string
): Promise<void> {
  const player = getOrCreateAudioPlayer(guildId);
  const resource = createAudioResource(filePath, { inlineVolume: true });

  return new Promise((resolve, reject) => {
    const onIdle = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      player.removeListener(AudioPlayerStatus.Idle, onIdle);
      player.removeListener("error", onError);
    };

    player.once(AudioPlayerStatus.Idle, onIdle);
    player.once("error", onError);
    connection.subscribe(player);
    player.play(resource);
  });
}

function stopPlayback(guildId: string): void {
  const player = audioPlayers.get(guildId);
  if (player) {
    player.stop(true);
  }
}

async function maybeSendDebugNotice(client: Client, guildId: string): Promise<void> {
  const config = getGuildConfig(guildId);
  const session = getVoiceSession(guildId);
  if (config.debugLevel === 0 || session.pendingNoticeSent) {
    return;
  }

  updateVoiceSession(guildId, (current) => ({
    ...current,
    pendingNoticeSent: true,
  }));

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    return;
  }

  await speakText(client, guildId, connection, DEBUG_NOTICE_TEXT);
}

async function logDebug(
  client: Client,
  guildId: string,
  level: number,
  message: string
): Promise<void> {
  const config = getGuildConfig(guildId);
  if (!config.debugChannelId || config.debugLevel < level) {
    return;
  }

  try {
    const channel = await client.channels.fetch(config.debugChannelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      return;
    }
    await channel.send(message);
  } catch (error) {
    console.error("デバッグログ送信エラー:", error);
  }
}

function resetSessionAfterTurn(guildId: string): void {
  updateVoiceSession(guildId, (session) => ({
    ...session,
    state: "IDLE",
    currentSpeakerId: undefined,
    currentUtteranceId: undefined,
  }));
}

function isSessionActive(guildId: string, utteranceId: string): boolean {
  const session = getVoiceSession(guildId);
  return session.isVcModeRunning && session.currentUtteranceId === utteranceId;
}
