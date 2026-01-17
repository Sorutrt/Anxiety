import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { STT_TIMEOUT_SEC } from "../constants";
import { retryOnce } from "../utils/async";

type CommandSpec = {
  command: string;
  args: string[];
};

function getDefaultProjectDir(): string {
  return path.resolve(process.cwd(), "tools", "kotoba-whisper");
}

function resolveCommandSpec(wavPath: string): CommandSpec {
  const extraArgs = parseExtraArgs();
  const explicitBin = process.env.KOTOBA_WHISPER_BIN?.trim() ?? "";
  const defaultCmd = path.resolve(getDefaultProjectDir(), "kotoba-whisper.cmd");

  if (!explicitBin || path.resolve(explicitBin) === defaultCmd) {
    const uvBin = process.env.KOTOBA_WHISPER_UV_BIN?.trim() || "uv";
    const projectDir = process.env.KOTOBA_WHISPER_UV_PROJECT?.trim() || getDefaultProjectDir();
    const scriptPath = path.resolve(projectDir, "whisper_cli.py");
    return {
      command: uvBin,
      args: ["run", "--project", projectDir, "python", scriptPath, ...extraArgs, wavPath],
    };
  }

  return { command: explicitBin, args: [...extraArgs, wavPath] };
}

function parseExtraArgs(): string[] {
  const raw = process.env.KOTOBA_WHISPER_ARGS;
  if (!raw) {
    return [];
  }
  return raw.split(" ").map((arg) => arg.trim()).filter(Boolean);
}

async function runCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const useShell = command.toLowerCase().endsWith(".cmd") || command.toLowerCase().endsWith(".bat");
    const child = spawn(command, args, {
      windowsHide: true,
      shell: useShell,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    });
    let stdout = "";
    let stderr = "";
    const debugEnabled = process.env.KOTOBA_WHISPER_DEBUG === "1";
    if (debugEnabled) {
      const printableArgs = args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
      console.log(`[STT:DEBUG] exec: ${command} ${printableArgs}`);
    }
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("STTの実行がタイムアウトしました。"));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (debugEnabled) {
        process.stdout.write(`[STT:DEBUG][stdout] ${chunk}`);
      }
    });
    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (debugEnabled) {
        process.stderr.write(`[STT:DEBUG][stderr] ${chunk}`);
      }
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`STTの実行に失敗しました (code=${code}): ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// kotoba-whisper CLIの結果を返す。
export async function transcribeAudio(wavPath: string, guildId: string): Promise<string> {
  const spec = resolveCommandSpec(wavPath);
  if (spec.command !== "uv" && !fs.existsSync(spec.command)) {
    throw new Error(`kotoba-whisperの実行ファイルが見つかりません: ${spec.command}`);
  }

  const timeoutSec = Number.parseInt(process.env.KOTOBA_WHISPER_TIMEOUT_SEC ?? "", 10);
  const effectiveTimeoutSec = Number.isFinite(timeoutSec) ? timeoutSec : STT_TIMEOUT_SEC;
  const timeoutMs = effectiveTimeoutSec * 1000;
  const result = await retryOnce(() => runCommand(spec.command, spec.args, timeoutMs));
  return result;
}
