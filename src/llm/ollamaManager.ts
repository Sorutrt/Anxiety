import { spawn, spawnSync, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import {
  OLLAMA_API_BASE_URL,
  OLLAMA_BIN_PATH,
  OLLAMA_HOST,
  OLLAMA_MODELS_DIR,
  OLLAMA_TMP_DIR,
} from "./ollamaConfig";

const OLLAMA_STARTUP_TIMEOUT_MS = 20_000;
const OLLAMA_HEALTHCHECK_TIMEOUT_MS = 2_000;
const OLLAMA_HEALTHCHECK_INTERVAL_MS = 500;

let ollamaProcess: ChildProcess | null = null;
let startPromise: Promise<void> | null = null;
let shutdownHandlersRegistered = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// OllamaのAPIが応答するかを短時間で確認する。
async function isOllamaHealthy(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_HEALTHCHECK_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 起動直後のOllamaがAPIを返すまで待つ。
async function waitForOllamaReady(): Promise<void> {
  const startAt = Date.now();
  while (Date.now() - startAt < OLLAMA_STARTUP_TIMEOUT_MS) {
    if (await isOllamaHealthy()) {
      return;
    }
    await delay(OLLAMA_HEALTHCHECK_INTERVAL_MS);
  }
  throw new Error("Ollamaの起動待ちがタイムアウトしました。");
}

function ensureOllamaDirs(): void {
  fs.mkdirSync(OLLAMA_MODELS_DIR, { recursive: true });
  fs.mkdirSync(OLLAMA_TMP_DIR, { recursive: true });
}

// Ollamaサーバープロセスを起動する。
function startOllamaProcess(): void {
  if (ollamaProcess) {
    return;
  }
  ensureOllamaDirs();
  const env = {
    ...process.env,
    OLLAMA_MODELS: OLLAMA_MODELS_DIR,
    OLLAMA_TMPDIR: OLLAMA_TMP_DIR,
    OLLAMA_HOST,
  };
  const processOptions = {
    env,
    cwd: path.dirname(OLLAMA_BIN_PATH),
    windowsHide: true,
    stdio: "ignore" as const,
  };
  ollamaProcess = spawn(OLLAMA_BIN_PATH, ["serve"], processOptions);
  ollamaProcess.on("exit", (code, signal) => {
    console.warn(`[OLLAMA] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    ollamaProcess = null;
  });
  ollamaProcess.on("error", (error) => {
    console.error("[OLLAMA] spawn error:", error);
  });
}

// Ollamaが起動していなければ起動し、APIが使える状態まで待つ。
export async function ensureOllamaRunning(): Promise<void> {
  if (await isOllamaHealthy()) {
    return;
  }
  if (startPromise) {
    return await startPromise;
  }
  startPromise = (async () => {
    if (!fs.existsSync(OLLAMA_BIN_PATH)) {
      throw new Error(
        `Ollamaの実行ファイルが見つかりません: ${OLLAMA_BIN_PATH}（tools/ollama/install.ps1 を実行してください）`
      );
    }
    startOllamaProcess();
    await waitForOllamaReady();
  })();
  try {
    await startPromise;
  } finally {
    startPromise = null;
  }
}

// 既存のOllamaも含めて強制終了する。
export async function stopOllamaServer(): Promise<void> {
  if (ollamaProcess) {
    try {
      ollamaProcess.kill();
    } catch (error) {
      console.warn("[OLLAMA] kill error:", error);
    }
    ollamaProcess = null;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/IM", "ollama.exe", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.on("exit", () => resolve(undefined));
      killer.on("error", () => resolve(undefined));
    });
  }
}

// プロセス終了時にOllamaを確実に停止する。
export function registerOllamaShutdownHandlers(): void {
  if (shutdownHandlersRegistered) {
    return;
  }
  shutdownHandlersRegistered = true;

  const stopSync = () => {
    try {
      if (ollamaProcess) {
        ollamaProcess.kill();
        ollamaProcess = null;
      }
    } catch (error) {
      console.warn("[OLLAMA] kill error:", error);
    }
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/IM", "ollama.exe", "/F"], { windowsHide: true });
    }
  };

  process.once("exit", stopSync);
  process.once("SIGINT", () => {
    stopSync();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    stopSync();
    process.exit(0);
  });
}
