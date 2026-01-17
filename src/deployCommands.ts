import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { debugCommandData } from "./commands/debug";
import { joinCommandData } from "./commands/join";
import { leaveCommandData } from "./commands/leave";
import { resetCommandData } from "./commands/reset";
import { setCommandData } from "./commands/set";
import { skipCommandData } from "./commands/skip";
import { vcCommandData } from "./commands/vc";

dotenv.config();

const commands: any[] = [
  joinCommandData.toJSON(),
  leaveCommandData.toJSON(),
  vcCommandData.toJSON(),
  skipCommandData.toJSON(),
  resetCommandData.toJSON(),
  setCommandData.toJSON(),
  debugCommandData.toJSON(),
];

const rest = new REST().setToken(process.env.TOKEN!); // TOKENがundifinedの可能性はないとして!をつける

async function main() {
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
            { body: commands }
        );

        console.log("コマンドは正常にデプロイされました。");
    }
    catch (e) {
        console.error("エラーが発生しました。" + e);
    }
}

main().catch(err => console.log(err));
