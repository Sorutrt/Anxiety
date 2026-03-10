import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "fs";
import { createInterface } from "readline";
import { retryOnce } from "../utils/async";
import {
  getTimeoutMs,
  getWorkerCount,
  isPersistentEnabled,
  resolveCliCommandSpec,
  resolveServerCommandSpec,
} from "./moonshineVoiceConfig";
import type { CommandSpec } from "./moonshineVoiceConfig";

type SttRequest = {
  id: string;
  wavPath: string;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
  cancelled: boolean;
  completed: boolean;
  worker?: MoonshineWorker;
};

type SttResponse = {
  type?: string;
  id?: string;
  ok?: boolean;
  text?: string;
  error?: string;
};

let requestCounter = 0;

function createRequestId(): string {
  requestCounter += 1;
  return `${process.pid}-${Date.now()}-${requestCounter}`;
}

function buildSpawnEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
  };
}

function logDebug(message: string): void {
  if (process.env.MOONSHINE_VOICE_DEBUG === "1") {
    console.log(message);
  }
}

function formatCommand(command: string, args: string[]): string {
  const printableArgs = args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
  return `${command} ${printableArgs}`;
}

// 常駐STTプロセス1本と通信し、1リクエストずつ処理する。
class MoonshineWorker {
  private readonly index: number;
  private readonly command: string;
  private readonly args: string[];
  private readonly onIdle: () => void;
  private readonly onExit: (worker: MoonshineWorker, error: Error) => void;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private currentTask: SttRequest | null = null;
  private ready = false;
  private startPromise: Promise<void> | null = null;

  constructor(
    index: number,
    command: string,
    args: string[],
    onIdle: () => void,
    onExit: (worker: MoonshineWorker, error: Error) => void
  ) {
    this.index = index;
    this.command = command;
    this.args = args;
    this.onIdle = onIdle;
    this.onExit = onExit;
  }

  getIndex(): number {
    return this.index;
  }

  isIdle(): boolean {
    return this.ready && !this.currentTask;
  }

  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }

    const startPromise = new Promise<void>((resolve, reject) => {
      this.ready = false;
      const proc = spawn(this.command, this.args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: buildSpawnEnv(),
      });
      this.proc = proc;
      logDebug(`[STT:DEBUG][worker:${this.index}] exec: ${formatCommand(this.command, this.args)}`);

      const rl = createInterface({ input: proc.stdout });
      let resolvedReady = false;
      const markReady = () => {
        if (resolvedReady) {
          return;
        }
        resolvedReady = true;
        this.ready = true;
        resolve();
      };

      rl.on("line", (line) => {
        this.handleLine(line, markReady);
      });

      proc.stderr.on("data", (data) => {
        const chunk = data.toString();
        logDebug(`[STT:DEBUG][worker:${this.index}][stderr] ${chunk}`);
      });

      proc.on("error", (error) => {
        this.handleExit(error);
        if (!resolvedReady) {
          reject(error);
        }
      });
      proc.on("exit", (code, signal) => {
        const error = new Error(
          `Moonshine Voice プロセスが終了しました (code=${code ?? "unknown"} signal=${
            signal ?? "unknown"
          })`
        );
        this.handleExit(error);
        if (!resolvedReady) {
          reject(error);
        }
      });
    });

    this.startPromise = startPromise.finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  stop(): void {
    this.proc?.kill();
  }

  assign(task: SttRequest): void {
    if (!this.proc || !this.ready) {
      throw new Error("STTワーカーが起動していません。");
    }
    this.currentTask = task;
    task.worker = this;

    const payload = JSON.stringify({ id: task.id, wav_path: task.wavPath });
    this.proc.stdin.write(`${payload}\n`);
  }

  private handleLine(line: string, markReady: () => void): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message: SttResponse;
    try {
      message = JSON.parse(trimmed) as SttResponse;
    } catch {
      logDebug(`[STT:DEBUG][worker:${this.index}] invalid json: ${trimmed}`);
      return;
    }

    if (message.type === "ready") {
      markReady();
      return;
    }
    if (message.type === "shutdown") {
      return;
    }

    const task = this.currentTask;
    if (!task) {
      logDebug(`[STT:DEBUG][worker:${this.index}] response without task: ${trimmed}`);
      return;
    }
    if (message.id !== task.id) {
      logDebug(`[STT:DEBUG][worker:${this.index}] response id mismatch: ${trimmed}`);
      return;
    }

    this.currentTask = null;
    if (task.completed) {
      this.onIdle();
      return;
    }
    task.completed = true;
    clearTimeout(task.timeoutId);

    if (message.ok && typeof message.text === "string") {
      task.resolve(message.text);
    } else {
      const errorMessage =
        typeof message.error === "string" && message.error
          ? message.error
          : "STTの実行に失敗しました。";
      task.reject(new Error(errorMessage));
    }
    this.onIdle();
  }

  private handleExit(error: Error): void {
    if (this.currentTask && !this.currentTask.completed) {
      const task = this.currentTask;
      this.currentTask = null;
      task.completed = true;
      clearTimeout(task.timeoutId);
      if (!task.cancelled) {
        task.reject(error);
      }
    }
    this.ready = false;
    this.proc = null;
    this.onExit(this, error);
  }
}

// STTワーカーのプールとキューを管理し、並列処理数を制御する。
class MoonshineWorkerPool {
  private readonly queue: SttRequest[] = [];
  private readonly workers: MoonshineWorker[] = [];
  private readonly timeoutMs: number;
  private stopping = false;

  constructor(commandSpec: CommandSpec, workerCount: number, timeoutMs: number) {
    this.timeoutMs = timeoutMs;
    for (let index = 0; index < workerCount; index += 1) {
      this.workers.push(
        new MoonshineWorker(
          index,
          commandSpec.command,
          commandSpec.args,
          () => this.dispatch(),
          (worker, error) => this.handleWorkerExit(worker, error)
        )
      );
    }
  }

  async start(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.start()));
  }

  stop(): void {
    this.stopping = true;
    this.workers.forEach((worker) => worker.stop());
  }

  request(wavPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const task: SttRequest = {
        id: createRequestId(),
        wavPath,
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          if (task.completed) {
            return;
          }
          task.completed = true;
          task.cancelled = true;
          this.removeFromQueue(task);
          if (task.worker) {
            task.worker.stop();
          }
          reject(new Error("STTの実行がタイムアウトしました。"));
        }, this.timeoutMs),
        cancelled: false,
        completed: false,
      };
      this.queue.push(task);
      this.dispatch();
    });
  }

  private removeFromQueue(task: SttRequest): void {
    const index = this.queue.indexOf(task);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }

  private dispatch(): void {
    for (const worker of this.workers) {
      if (!worker.isIdle()) {
        continue;
      }
      const task = this.queue.shift();
      if (!task) {
        return;
      }
      if (task.completed) {
        continue;
      }
      try {
        worker.assign(task);
      } catch (error) {
        task.completed = true;
        clearTimeout(task.timeoutId);
        task.reject(error instanceof Error ? error : new Error("STTの実行に失敗しました。"));
      }
    }
  }

  private handleWorkerExit(worker: MoonshineWorker, error: Error): void {
    if (this.stopping) {
      return;
    }
    logDebug(
      `[STT:DEBUG][worker:${worker.getIndex()}] exit: ${error.message ?? "unknown error"}`
    );
    void worker
      .start()
      .then(() => this.dispatch())
      .catch((startError) => {
        console.error("STTワーカーの再起動に失敗しました:", startError);
      });
  }
}

let pool: MoonshineWorkerPool | null = null;
let poolStartPromise: Promise<void> | null = null;

export async function initializeMoonshineVoicePool(): Promise<void> {
  if (!isPersistentEnabled()) {
    return;
  }
  if (poolStartPromise) {
    return await poolStartPromise;
  }

  const commandSpec = resolveServerCommandSpec();
  const workerCount = getWorkerCount();
  const timeoutMs = getTimeoutMs();
  pool = new MoonshineWorkerPool(commandSpec, workerCount, timeoutMs);

  poolStartPromise = pool.start().catch((error) => {
    poolStartPromise = null;
    pool = null;
    throw error;
  });

  await poolStartPromise;
}

export function shutdownMoonshineVoicePool(): void {
  pool?.stop();
  pool = null;
  poolStartPromise = null;
}

async function runCommand(command: string, args: string[], timeoutMs: number): Promise<string> {
  return await new Promise((resolve, reject) => {
    const useShell = command.toLowerCase().endsWith(".cmd") || command.toLowerCase().endsWith(".bat");
    const child = spawn(command, args, {
      windowsHide: true,
      shell: useShell,
      env: buildSpawnEnv(),
    });
    let stdout = "";
    let stderr = "";
    if (process.env.MOONSHINE_VOICE_DEBUG === "1") {
      logDebug(`[STT:DEBUG] exec: ${formatCommand(command, args)}`);
    }
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("STTの実行がタイムアウトしました。"));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (process.env.MOONSHINE_VOICE_DEBUG === "1") {
        process.stdout.write(`[STT:DEBUG][stdout] ${chunk}`);
      }
    });
    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      if (process.env.MOONSHINE_VOICE_DEBUG === "1") {
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

// Moonshine Voice CLIの結果を返す。
export async function transcribeAudio(wavPath: string, guildId: string): Promise<string> {
  void guildId;

  if (!isPersistentEnabled()) {
    const spec = resolveCliCommandSpec(wavPath);
    const explicitBin = process.env.MOONSHINE_VOICE_BIN?.trim();
    if (explicitBin && !fs.existsSync(spec.command)) {
      throw new Error(`Moonshine Voice の実行ファイルが見つかりません: ${spec.command}`);
    }

    const timeoutMs = getTimeoutMs();
    return await retryOnce(() => runCommand(spec.command, spec.args, timeoutMs));
  }

  await initializeMoonshineVoicePool();
  const activePool = pool;
  if (!activePool) {
    throw new Error("STTワーカーが起動していません。");
  }
  return await retryOnce(() => activePool.request(wavPath));
}
