import { Interaction, SlashCommandBuilder } from "discord.js";
import { resetHistory } from "../voice/voiceService";

export const resetCommandData = new SlashCommandBuilder()
  .setName("reset")
  .setDescription("会話履歴をクリアします");

export async function resetCommand(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  await resetHistory(interaction);
}
