//必要なパッケージをインポートする
import {
  GatewayIntentBits,
  Client,
  Partials,
  Message,
  Events,
  CacheType,
  Interaction,
} from "discord.js";
import dotenv from "dotenv";
import { joinCommandData, joinVC } from "./commands/join";
import { leaveCommandData, leaveVC } from "./commands/leave";
import { vcCommandData, handleVcCommand } from "./commands/vc";
import { skipCommandData, skipCommand } from "./commands/skip";
import { resetCommandData, resetCommand } from "./commands/reset";
import { setCommandData, handleSetCommand } from "./commands/set";
import { debugCommandData, handleDebugCommand } from "./commands/debug";
import { textToSaveWav } from "./aivoice";
import { getVoiceConnection } from "@discordjs/voice";
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url";
import {
  handleVoiceStateUpdate,
  playAudioFileForGuild,
} from "./voice/voiceService";

//.envファイルを読み込む
dotenv.config()

// ESM環境に合わせて定義する
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __savedWavDir = path.resolve(__dirname, "../voice/")

const permittedUsersId: string[] = process.env.PERMITTED_USERS!.split(",")

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

// メッセージ送ると喋る
client.on('messageCreate', async (message: Message) => {

  if (message.author.bot || !permittedUsersId.includes(message.author.id)) return;

  // VC接続確認
  const connection = getVoiceConnection(message.guild!.id);
  if (!connection) {
    return;
  }

  // 音声生成
  await textToSaveWav(message.content, __savedWavDir);

  // 音声ファイルのパスとその確認
  const serchFileName = message.content.slice(0,10) + ".wav";
  const wavFileName: string | undefined = fs.readdirSync(__savedWavDir).filter((filename) => filename.includes(serchFileName))[0]; // A.I.VOICEの命名規則で最後に{Text}をつける！
  if (typeof wavFileName === "undefined") {
    console.log ("wavが見つかりませんでした");
    console.log(`探そうとした名前: ${serchFileName}`);
    message.reply(`内部で生成されたwavが見つかりませんでした`);
    return;
  }

  const audioFilePath = path.resolve(__savedWavDir, wavFileName);
  if (!fs.existsSync(audioFilePath)) {
    message.reply("音声ファイルが見つかりません。");
    console.error("音声ファイルが見つかりません: " + audioFilePath);
    return;
  }
  
  try {
    await playAudioFileForGuild(message.guild!.id, connection, audioFilePath);
  } finally {
    deleteGeneratedFiles(audioFilePath);
  }

});


// VCの参加人数ガード
client.on(Events.VoiceStateUpdate, (_, newState) => {
  handleVoiceStateUpdate(client, newState);
});

function deleteGeneratedFiles(wavPath: string): void {
  fs.unlink(wavPath, () => undefined);
  fs.unlink(wavPath.replace(/\.wav$/i, ".txt"), () => undefined);
}


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
    [vcCommandData.name, handleVcCommand],
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
