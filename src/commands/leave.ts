import { Interaction, SlashCommandBuilder } from "discord.js";
import { leaveVoiceChannel } from "../voice/voiceService";

export const leaveCommandData = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("ボイスチャンネルから退出します");

export async function leaveVC(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  await leaveVoiceChannel(interaction);
}
