import {
  ChannelType,
  Interaction,
  PermissionsBitField,
  SlashCommandBuilder,
} from "discord.js";
import { findCharacter } from "../characters";
import { updateGuildConfig, updateVoiceSession } from "../state";

export const setCommandData = new SlashCommandBuilder()
  .setName("set")
  .setDescription("設定を変更します")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("character")
      .setDescription("話者キャラクターを設定します")
      .addStringOption((option) =>
        option
          .setName("id_or_name")
          .setDescription("キャラクターIDまたは名前")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("debug_channel")
      .setDescription("デバッグログの出力先を設定します")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("デバッグログ用のチャンネル")
          .addChannelTypes(ChannelType.GuildText)
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

export async function handleSetCommand(interaction: Interaction) {
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
  if (subcommand === "character") {
    const idOrName = interaction.options.getString("id_or_name", true);
    const character = findCharacter(idOrName);
    if (!character) {
      await interaction.reply("指定されたキャラクターが見つかりません。");
      return;
    }

    updateGuildConfig(interaction.guildId, (config) => ({
      ...config,
      defaultCharacterId: character.id,
    }));
    updateVoiceSession(interaction.guildId, (session) => ({
      ...session,
      characterId: character.id,
    }));

    await interaction.reply(`キャラクターを「${character.displayName}」に設定しました。`);
    return;
  }

  if (subcommand === "debug_channel") {
    const channel = interaction.options.getChannel("channel", true);
    updateGuildConfig(interaction.guildId, (config) => ({
      ...config,
      debugChannelId: channel.id,
    }));
    await interaction.reply(`デバッグログの出力先を ${channel.toString()} に設定しました。`);
  }
}
