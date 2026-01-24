import { getCharacters } from "./characters";
import { GuildConfig, VoiceSession } from "./types";

const guildConfigs = new Map<string, GuildConfig>();
const voiceSessions = new Map<string, VoiceSession>();

export function getGuildConfig(guildId: string): GuildConfig {
  const existing = guildConfigs.get(guildId);
  if (existing) {
    return existing;
  }

  const characters = getCharacters();
  const defaultCharacterId = characters[0]?.id ?? "default";

  const config: GuildConfig = {
    guildId,
    defaultCharacterId,
    debugLevel: 0,
    providers: {
      stt: "openai-whisper",
      llm: "gemini-2.5-flash-lite",
      tts: "aivoice",
    },
  };

  guildConfigs.set(guildId, config);
  return config;
}

export function updateGuildConfig(
  guildId: string,
  updater: (config: GuildConfig) => GuildConfig
): GuildConfig {
  const current = getGuildConfig(guildId);
  const updated = updater(current);
  guildConfigs.set(guildId, updated);
  return updated;
}

// VC会話の一時状態をメモリに保持する。
export function getVoiceSession(guildId: string, voiceChannelId?: string): VoiceSession {
  const existing = voiceSessions.get(guildId);
  if (existing) {
    if (voiceChannelId) {
      existing.voiceChannelId = voiceChannelId;
    }
    return existing;
  }

  const config = getGuildConfig(guildId);
  const session: VoiceSession = {
    guildId,
    voiceChannelId: voiceChannelId ?? "",
    characterId: config.defaultCharacterId,
    state: "IDLE",
    history: [],
    pendingNoticeSent: false,
    isVcModeRunning: false,
  };

  voiceSessions.set(guildId, session);
  return session;
}

export function updateVoiceSession(
  guildId: string,
  updater: (session: VoiceSession) => VoiceSession
): VoiceSession {
  const current = getVoiceSession(guildId);
  const updated = updater(current);
  voiceSessions.set(guildId, updated);
  return updated;
}

export function clearVoiceSession(guildId: string): void {
  voiceSessions.delete(guildId);
}
