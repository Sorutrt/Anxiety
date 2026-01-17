export type VoiceState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "THINKING"
  | "SPEAKING"
  | "COOLDOWN";

export type StopReason = "MULTI_MEMBER" | "MANUAL" | "ERROR" | "TIMEOUT" | "UNKNOWN";

export type DebugLevel = 0 | 1 | 2;

export type ProviderConfig = {
  stt: string;
  llm: string;
  tts: string;
};

export type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
  at: number;
};

export type GuildConfig = {
  guildId: string;
  defaultCharacterId: string;
  debugChannelId?: string;
  debugLevel: DebugLevel;
  providers: ProviderConfig;
};

export type VoiceSession = {
  guildId: string;
  voiceChannelId: string;
  characterId: string;
  state: VoiceState;
  history: ConversationTurn[];
  pendingNoticeSent: boolean;
  isVcModeRunning: boolean;
  stopReason?: StopReason;
  currentSpeakerId?: string;
  currentUtteranceId?: string;
};

export type CharacterDefinition = {
  id: string;
  displayName: string;
  systemPrompt: string;
  speakingStyle: string;
  voicePreset: string;
};
