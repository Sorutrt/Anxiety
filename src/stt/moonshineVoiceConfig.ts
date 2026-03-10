import fs from "fs";
import path from "path";
import { STT_TIMEOUT_SEC } from "../constants";

export type CommandSpec = {
  command: string;
  args: string[];
};

const DEFAULT_WORKERS = 1;

export function getDefaultProjectDir(cwd: string = process.cwd()): string {
  return path.resolve(cwd, "tools", "moonshine-voice");
}

function parseExtraArgs(raw: string | undefined = process.env.MOONSHINE_VOICE_ARGS): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(" ")
    .map((arg) => arg.trim())
    .filter(Boolean);
}

export function resolveCliCommandSpec(
  wavPath: string,
  cwd: string = process.cwd()
): CommandSpec {
  const extraArgs = parseExtraArgs();
  const explicitBin = process.env.MOONSHINE_VOICE_BIN?.trim() ?? "";
  if (explicitBin) {
    return { command: explicitBin, args: [...extraArgs, wavPath] };
  }

  const projectDir = process.env.MOONSHINE_VOICE_UV_PROJECT?.trim() || getDefaultProjectDir(cwd);
  const uvBin = process.env.MOONSHINE_VOICE_UV_BIN?.trim() || "uv";
  const scriptPath = path.resolve(projectDir, "moonshine_voice_cli.py");
  return {
    command: uvBin,
    args: ["run", "--project", projectDir, "python", scriptPath, ...extraArgs, wavPath],
  };
}

export function resolveServerCommandSpec(cwd: string = process.cwd()): CommandSpec {
  const projectDir = process.env.MOONSHINE_VOICE_UV_PROJECT?.trim() || getDefaultProjectDir(cwd);
  const scriptPath = path.resolve(projectDir, "moonshine_voice_server.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Moonshine Voice サーバーが見つかりません: ${scriptPath}`);
  }

  const uvBin = process.env.MOONSHINE_VOICE_UV_BIN?.trim() || "uv";
  const extraArgs = parseExtraArgs();
  return {
    command: uvBin,
    args: ["run", "--project", projectDir, "python", scriptPath, ...extraArgs],
  };
}

export function isPersistentEnabled(): boolean {
  const raw = process.env.MOONSHINE_VOICE_PERSISTENT?.trim();
  if (!raw) {
    return true;
  }
  return raw !== "0" && raw.toLowerCase() !== "false";
}

export function getTimeoutMs(): number {
  const timeoutSec = Number.parseInt(process.env.MOONSHINE_VOICE_TIMEOUT_SEC ?? "", 10);
  const effectiveTimeoutSec = Number.isFinite(timeoutSec) ? timeoutSec : STT_TIMEOUT_SEC;
  return effectiveTimeoutSec * 1000;
}

export function getWorkerCount(): number {
  const raw = Number.parseInt(process.env.MOONSHINE_VOICE_WORKERS ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_WORKERS;
}
