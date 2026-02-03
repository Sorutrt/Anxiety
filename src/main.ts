//必要なパッケージをインポートする
import {
  GatewayIntentBits,
  Client,
  Partials,
  Events,
  CacheType,
  Interaction,
} from "discord.js";
import dotenv from "dotenv";
import { joinCommandData, joinVC } from "./commands/join";
import { leaveCommandData, leaveVC } from "./commands/leave";
import { skipCommandData, skipCommand } from "./commands/skip";
import { resetCommandData, resetCommand } from "./commands/reset";
import { setCommandData, handleSetCommand } from "./commands/set";
import { debugCommandData, handleDebugCommand } from "./commands/debug";
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url";
import { handleVoiceStateUpdate } from "./voice/voiceService";
import { initializeKotobaWhisperPool } from "./stt/openaiWhisper";
import { registerOllamaShutdownHandlers } from "./llm/ollamaManager";
import { initializeAivoiceOnStartup } from "./aivoice";

//.envファイルを読み込む
dotenv.config()
registerOllamaShutdownHandlers()

void initializeAivoiceOnStartup().catch((error) => {
  console.error("A.I.VOICEの起動に失敗しました:", error);
});

void initializeKotobaWhisperPool().catch((error) => {
  console.error("STT初期化に失敗しました:", error);
});

// ESM環境に合わせて定義する
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __savedWavDir = path.resolve(__dirname, "../voice/")

//Botで使うGatewayIntents、partials
const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel],
})

//Botがきちんと起動したか確認
client.once('ready', () => {
  // 既存のWav削除
  try {
    const savedWavList = fs.readdirSync(__savedWavDir)
    savedWavList.forEach( (file) => {
      fs.rm(path.resolve(__savedWavDir, file), () => {})
    })
  } catch (e) {
    console.log(e);
  }

  // Ready!!
  console.log('Ready!')
  if(client.user){
      console.log(client.user.tag)
  }
})


// VCの参加人数ガード
client.on(Events.VoiceStateUpdate, (_, newState) => {
  handleVoiceStateUpdate(client, newState);
});

// スラッシュコマンド
client.on(Events.InteractionCreate, async (interaction: Interaction<CacheType>) => {
  //console.log(interaction); //test code
  
  if (!interaction.isChatInputCommand()) {
      return;
  }
  const { commandName } = interaction;

  const handlers = new Map<string, (interaction: Interaction<CacheType>) => Promise<void> | void>([
    [joinCommandData.name, joinVC],
    [leaveCommandData.name, leaveVC],
    [skipCommandData.name, skipCommand],
    [resetCommandData.name, resetCommand],
    [setCommandData.name, handleSetCommand],
    [debugCommandData.name, handleDebugCommand],
  ]);

  const handler = handlers.get(commandName);
  if (!handler) {
    return;
  }

  try {
    await handler(interaction);
  } catch (e) {
    console.log("エラーが発生しました");
    console.error(e);
  }
})

//ボット作成時のトークンでDiscordと接続
client.login(process.env.TOKEN)
