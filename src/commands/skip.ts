import { Interaction, SlashCommandBuilder } from "discord.js";
import { skipPlayback } from "../voice/voiceService";

export const skipCommandData = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("再生中の音声をスキップします");

export async function skipCommand(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  await skipPlayback(interaction);
}
