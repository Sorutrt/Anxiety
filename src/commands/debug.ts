import { Interaction, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { updateGuildConfig } from "../state";
import { DebugLevel } from "../types";

export const debugCommandData = new SlashCommandBuilder()
  .setName("debug")
  .setDescription("デバッグ設定を変更します")
  .addSubcommand((subcommand) =>
    subcommand.setName("on").setDescription("デバッグを有効化します")
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("off").setDescription("デバッグを無効化します")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("level")
      .setDescription("デバッグレベルを設定します")
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription("0:なし 1:主要 2:詳細")
          .setMinValue(0)
          .setMaxValue(2)
          .setRequired(true)
      )
  );

function ensureAdmin(interaction: Interaction): boolean {
  if (!interaction.isChatInputCommand()) {
    return false;
  }

  const hasPermission = interaction.memberPermissions?.has(
    PermissionsBitField.Flags.Administrator
  );
  if (!hasPermission) {
    void interaction.reply("このコマンドは管理者のみ実行できます。");
    return false;
  }
  return true;
}

export async function handleDebugCommand(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) {
    return;
  }
  if (!interaction.guildId) {
    await interaction.reply("このコマンドはギルド内でのみ実行できます。");
    return;
  }
  if (!ensureAdmin(interaction)) {
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "on") {
    updateGuildConfig(interaction.guildId, (config) => ({
      ...config,
      debugLevel: 1,
    }));
    await interaction.reply("デバッグを有効化しました。");
    return;
  }

  if (subcommand === "off") {
    updateGuildConfig(interaction.guildId, (config) => ({
      ...config,
      debugLevel: 0,
    }));
    await interaction.reply("デバッグを無効化しました。");
    return;
  }

  if (subcommand === "level") {
    const levelValue = interaction.options.getInteger("value", true) as DebugLevel;
    updateGuildConfig(interaction.guildId, (config) => ({
      ...config,
      debugLevel: levelValue,
    }));
    await interaction.reply(`デバッグレベルを ${levelValue} に設定しました。`);
  }
}
