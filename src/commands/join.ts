import { Interaction, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
import { joinVoiceChannelFromInteraction } from "../voice/voiceService";

// .envファイルを読み込む
dotenv.config();

export const joinCommandData = new SlashCommandBuilder()
  .setName("join")
  .setDescription("ボイスチャンネルに接続してVC会話を開始します");

export async function joinVC(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  await joinVoiceChannelFromInteraction(interaction);
}
