import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  getDefaultProjectDir,
  getTimeoutMs,
  getWorkerCount,
  isPersistentEnabled,
  resolveCliCommandSpec,
  resolveServerCommandSpec,
} from "./moonshineVoiceConfig";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function withEnv(entries: Record<string, string | undefined>, callback: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  try {
    callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  }
}

function createProjectFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "moonshine-voice-"));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, "moonshine_voice_server.py"), "");
  fs.writeFileSync(path.join(dir, "moonshine_voice_cli.py"), "");
  return dir;
}

test("default project dir points to tools/moonshine-voice", () => {
  assert.equal(
    getDefaultProjectDir("C:\\workspace\\app"),
    path.resolve("C:\\workspace\\app", "tools", "moonshine-voice")
  );
});

test("cli command spec uses uv project and extra args by default", () => {
  const projectDir = createProjectFixture();
  withEnv(
    {
      MOONSHINE_VOICE_UV_PROJECT: projectDir,
      MOONSHINE_VOICE_UV_BIN: "uvx",
      MOONSHINE_VOICE_ARGS: "--language ja --max-tokens-per-second 13.0",
      MOONSHINE_VOICE_BIN: undefined,
    },
    () => {
      const spec = resolveCliCommandSpec("C:\\audio\\sample.wav");
      assert.equal(spec.command, "uvx");
      assert.deepEqual(spec.args, [
        "run",
        "--project",
        projectDir,
        "python",
        path.resolve(projectDir, "moonshine_voice_cli.py"),
        "--language",
        "ja",
        "--max-tokens-per-second",
        "13.0",
        "C:\\audio\\sample.wav",
      ]);
    }
  );
});

test("cli command spec respects explicit binary override", () => {
  withEnv(
    {
      MOONSHINE_VOICE_BIN: "C:\\tools\\moonshine-voice.cmd",
      MOONSHINE_VOICE_ARGS: "--language ja",
      MOONSHINE_VOICE_UV_PROJECT: undefined,
      MOONSHINE_VOICE_UV_BIN: undefined,
    },
    () => {
      const spec = resolveCliCommandSpec("C:\\audio\\sample.wav");
      assert.equal(spec.command, "C:\\tools\\moonshine-voice.cmd");
      assert.deepEqual(spec.args, ["--language", "ja", "C:\\audio\\sample.wav"]);
    }
  );
});

test("server command spec resolves project scripts", () => {
  const projectDir = createProjectFixture();
  withEnv(
    {
      MOONSHINE_VOICE_UV_PROJECT: projectDir,
      MOONSHINE_VOICE_UV_BIN: "uv",
      MOONSHINE_VOICE_ARGS: "--language ja",
    },
    () => {
      const spec = resolveServerCommandSpec();
      assert.equal(spec.command, "uv");
      assert.deepEqual(spec.args, [
        "run",
        "--project",
        projectDir,
        "python",
        path.resolve(projectDir, "moonshine_voice_server.py"),
        "--language",
        "ja",
      ]);
    }
  );
});

test("persistent, timeout, worker count read moonshine env vars", () => {
  withEnv(
    {
      MOONSHINE_VOICE_PERSISTENT: "0",
      MOONSHINE_VOICE_TIMEOUT_SEC: "21",
      MOONSHINE_VOICE_WORKERS: "3",
    },
    () => {
      assert.equal(isPersistentEnabled(), false);
      assert.equal(getTimeoutMs(), 21_000);
      assert.equal(getWorkerCount(), 3);
    }
  );
});
