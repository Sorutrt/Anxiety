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
import {
  CONTEXT_TURNS,
  DEBUG_NOTICE_TEXT,
  GENERAL_FALLBACK_TEXT,
  MAX_RESPONSE_CHARS,
  MAX_UTTERANCE_SEC,
  MIN_UTTERANCE_MS,
  MULTI_MEMBER_NOTICE_TEXT,
  STT_FALLBACK_TEXT,
  TTS_TIMEOUT_SEC,
  VAD_SILENCE_MS,
} from "../constants";
import { getCharacters } from "../characters";
import { getGuildConfig, getVoiceSession, updateVoiceSession } from "../state";
import type { ConversationTurn } from "../types";
import { textToSaveWav } from "../aivoice";
import { generateReply } from "../llm/gemini";
import { transcribeAudio } from "../stt/openaiWhisper";
import { retryOnce, withTimeout } from "../utils/async";

const audioPlayers = new Map<string, AudioPlayer>();
const receiverInitialized = new Set<string>();
const recordingDir = path.resolve(process.cwd(), "voice", "recorded");

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

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  getVoiceSession(guild.id, voiceChannel.id);
  getOrCreateAudioPlayer(guild.id);
  setupReceiver(interaction.client, guild.id, connection);

  await interaction.reply(`${voiceChannel.name} チャンネルに接続しました！`);
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

  connection.destroy();
  receiverInitialized.delete(guildId);
  updateVoiceSession(guildId, (session) => ({
    ...session,
    state: "IDLE",
    isVcModeRunning: false,
    stopReason: "MANUAL",
    currentSpeakerId: undefined,
    currentUtteranceId: undefined,
  }));

  await interaction.reply("ボイスチャンネルから退出しました。");
}

export async function startVcMode(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }

  const connection = getVoiceConnection(guildId);
  if (!connection) {
    await interaction.reply("ボイスチャンネルに接続してから開始してください。");
    return;
  }

  const session = getVoiceSession(guildId);
  const voiceChannelId = connection.joinConfig.channelId ?? session.voiceChannelId;
  const guild = interaction.guild;
  if (!guild || !voiceChannelId) {
    await interaction.reply("ボイスチャンネルが特定できません。");
    return;
  }

  const channel = guild.channels.cache.get(voiceChannelId);
  if (!channel || !channel.isVoiceBased()) {
    await interaction.reply("ボイスチャンネルが見つかりません。");
    return;
  }

  const nonBotMembers = countNonBotMembers(channel);
  if (nonBotMembers >= 2) {
    await stopForMultiMember(interaction.client, guildId, nonBotMembers);
    await interaction.reply("VC会話モードは1対1のときのみ開始できます。");
    return;
  }

  updateVoiceSession(guildId, (session) => ({
    ...session,
    isVcModeRunning: true,
    state: "IDLE",
    stopReason: undefined,
  }));
  setupReceiver(interaction.client, guildId, connection);

  await interaction.reply("VC会話モードを開始しました。");
}

export async function stopVcMode(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }

  updateVoiceSession(guildId, (session) => ({
    ...session,
    isVcModeRunning: false,
    state: "IDLE",
    stopReason: "MANUAL",
    currentSpeakerId: undefined,
    currentUtteranceId: undefined,
  }));
  stopPlayback(guildId);

  await interaction.reply("VC会話モードを停止しました。");
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
    return;
  }

  receiverInitialized.add(guildId);
  connection.receiver.speaking.on("start", (userId) => {
    void handleSpeechStart(client, guildId, userId, connection);
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
  stopPlayback(guildId);
  await logDebug(client, guildId, 1, `[GUARD] stop reason=MULTI_MEMBER nonBot=${nonBotMembers}`);

  if (config.debugLevel > 0) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
      await speakText(client, guildId, connection, MULTI_MEMBER_NOTICE_TEXT);
    }
  }
}

async function handleSpeechStart(
  client: Client,
  guildId: string,
  userId: string,
  connection: VoiceConnection
): Promise<void> {
  const session = getVoiceSession(guildId);
  if (!session.isVcModeRunning || session.state !== "IDLE") {
    return;
  }

  if (userId === client.user?.id) {
    return;
  }

  const member = await client.users.fetch(userId).catch(() => null);
  if (member?.bot) {
    return;
  }

  console.log(`[VOICE] Discordのボイスが入ってきた guild=${guildId} user=${userId}`);

  const voiceChannel = connection.joinConfig.channelId
    ? connection.joinConfig.channelId
    : session.voiceChannelId;
  updateVoiceSession(guildId, (current) => ({
    ...current,
    voiceChannelId: voiceChannel,
    pendingNoticeSent: false,
    state: "LISTENING",
    currentSpeakerId: userId,
    currentUtteranceId: `${userId}-${Date.now()}`,
  }));
  await logDebug(client, guildId, 1, `[STATE] IDLE -> LISTENING`);

  startRecording(client, guildId, userId, connection);
}

// 音声収録〜WAV保存までをまとめて行う。
function startRecording(
  client: Client,
  guildId: string,
  userId: string,
  connection: VoiceConnection
): void {
  const session = getVoiceSession(guildId);
  if (!session.currentUtteranceId) {
    return;
  }

  const utteranceId = session.currentUtteranceId;
  ensureRecordingDir();

  const receiverStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: VAD_SILENCE_MS,
    },
  });
  const decoder = new prism.opus.Decoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  });
  const chunks: Buffer[] = [];
  const startedAt = Date.now();
  const maxTimer = setTimeout(() => receiverStream.destroy(), MAX_UTTERANCE_SEC * 1000);
  let finished = false;

  receiverStream.pipe(decoder);

  decoder.on("data", (chunk) => {
    chunks.push(chunk as Buffer);
  });

  const finalizeOnce = () => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(maxTimer);
    const durationMs = Date.now() - startedAt;
    void finalizeRecording(client, guildId, utteranceId, durationMs, chunks);
  };

  decoder.on("end", finalizeOnce);
  decoder.on("close", finalizeOnce);

  receiverStream.on("error", (error) => {
    clearTimeout(maxTimer);
    console.error("音声受信エラー:", error);
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
  });

  decoder.on("error", (error) => {
    clearTimeout(maxTimer);
    console.error("Opusのデコードに失敗しました:", error);
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
  });
}

async function finalizeRecording(
  client: Client,
  guildId: string,
  utteranceId: string,
  durationMs: number,
  chunks: Buffer[]
): Promise<void> {
  const session = getVoiceSession(guildId);
  if (session.currentUtteranceId !== utteranceId) {
    return;
  }

  if (durationMs < MIN_UTTERANCE_MS || chunks.length === 0) {
    updateVoiceSession(guildId, (current) => ({
      ...current,
      state: "IDLE",
      currentSpeakerId: undefined,
      currentUtteranceId: undefined,
    }));
    await logDebug(client, guildId, 2, `[VAD] drop dur=${durationMs}ms`);
    return;
  }

  updateVoiceSession(guildId, (current) => ({
    ...current,
    state: "TRANSCRIBING",
  }));
  await logDebug(client, guildId, 1, `[STATE] LISTENING -> TRANSCRIBING`);
  await logDebug(client, guildId, 2, `[VAD] end dur=${(durationMs / 1000).toFixed(2)}s`);

  const wavPath = path.join(recordingDir, `${utteranceId}.wav`);
  const wavBuffer = createWavBuffer(Buffer.concat(chunks), 48000, 2);
  await fs.promises.writeFile(wavPath, wavBuffer);
  console.log(`[VOICE] 音声の保存が完了した path=${wavPath} durMs=${durationMs}`);

  try {
    await processUtterance(client, guildId, wavPath, utteranceId);
  } finally {
    await fs.promises.unlink(wavPath).catch(() => undefined);
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
  const sttStart = Date.now();
  try {
    console.log(`[STT] 音声をSTTに投げた path=${wavPath}`);
    const rawText = await transcribeAudio(wavPath, guildId);
    text = rawText.trim();
    console.log(`[STT] 認識結果 text="${text}"`);
    console.log(`[PIPELINE] STT=done LLM=waiting TTS=waiting`);
  } catch (error) {
    console.error("STTエラー:", error);
  }
  const sttTime = Date.now() - sttStart;

  if (!text) {
    await speakFallback(client, guildId, STT_FALLBACK_TEXT);
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
  const reply = await generateReplyFromGemini(guildId, userText);
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

async function generateReplyFromGemini(guildId: string, userText: string): Promise<string | null> {
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

  const wavFile = findLatestWavFile(voiceDir, formattedText);
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

function findLatestWavFile(dir: string, hintText: string): string | null {
  const searchFileName = hintText.slice(0, 10) + ".wav";
  const files = fs.readdirSync(dir).filter((filename) => filename.includes(searchFileName));
  if (files.length === 0) {
    return null;
  }
  const latest = files
    .map((filename) => {
      const resolved = path.resolve(dir, filename);
      return { path: resolved, mtime: fs.statSync(resolved).mtimeMs };
    })
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
