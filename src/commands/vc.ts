import { Interaction, SlashCommandBuilder } from "discord.js";
import { startVcMode, stopVcMode } from "../voice/voiceService";

export const vcCommandData = new SlashCommandBuilder()
  .setName("vc")
  .setDescription("VC会話モードを制御します")
  .addSubcommand((subcommand) =>
    subcommand.setName("start").setDescription("VC会話モードを開始します")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("stop").setDescription("VC会話モードを停止します")
  );

export async function handleVcCommand(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "start") {
    await startVcMode(interaction);
    return;
  }

  if (subcommand === "stop") {
    await stopVcMode(interaction);
  }
}
