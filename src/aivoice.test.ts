import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HOST_STATUS,
  createAivoiceState,
  ensureAivoiceConnected,
  resolveVoicePresetName,
} from "./aivoice";

type FakeControl = {
  Status: number;
  Version?: string;
  GetAvailableHostNames: () => string[];
  Initialize: (serviceName: string) => void;
  StartHost: () => void;
  Connect: () => void;
  VoiceNames: string[];
  VoicePresetNames: string[];
  CurrentVoicePresetName: string;
  Text: string;
  SaveAudioToFile: (savePath: string) => void;
};

function createFakeControl(initialStatus: number) {
  const calls: string[] = [];
  const control: FakeControl = {
    Status: initialStatus,
    Version: "",
    GetAvailableHostNames: () => {
      calls.push("GetAvailableHostNames");
      return ["host-1"];
    },
    Initialize: (serviceName: string) => {
      calls.push(`Initialize:${serviceName}`);
    },
    StartHost: () => {
      calls.push("StartHost");
      control.Status = HOST_STATUS.NotConnected;
    },
    Connect: () => {
      calls.push("Connect");
      control.Status = HOST_STATUS.Idle;
    },
    VoiceNames: ["VoiceA"],
    VoicePresetNames: ["PresetA"],
    CurrentVoicePresetName: "PresetA",
    Text: "",
    SaveAudioToFile: () => {},
  };
  return { control, calls };
}

test("ensureAivoiceConnected starts and connects when host is not running", async () => {
  const { control, calls } = createFakeControl(HOST_STATUS.NotRunning);
  const state = createAivoiceState();

  await ensureAivoiceConnected(
    control as unknown as Parameters<typeof ensureAivoiceConnected>[0],
    state
  );

  assert.deepEqual(calls, [
    "GetAvailableHostNames",
    "Initialize:host-1",
    "StartHost",
    "Connect",
  ]);
});

test("ensureAivoiceConnected connects when host is not connected", async () => {
  const { control, calls } = createFakeControl(HOST_STATUS.NotConnected);
  const state = createAivoiceState();

  await ensureAivoiceConnected(
    control as unknown as Parameters<typeof ensureAivoiceConnected>[0],
    state
  );

  assert.deepEqual(calls, ["GetAvailableHostNames", "Initialize:host-1", "Connect"]);
});

test("ensureAivoiceConnected skips connect when already idle", async () => {
  const { control, calls } = createFakeControl(HOST_STATUS.Idle);
  const state = createAivoiceState();

  await ensureAivoiceConnected(
    control as unknown as Parameters<typeof ensureAivoiceConnected>[0],
    state
  );

  assert.deepEqual(calls, ["GetAvailableHostNames", "Initialize:host-1"]);
});

test("ensureAivoiceConnected initializes only once per state", async () => {
  const { control, calls } = createFakeControl(HOST_STATUS.NotConnected);
  const state = createAivoiceState();

  await ensureAivoiceConnected(
    control as unknown as Parameters<typeof ensureAivoiceConnected>[0],
    state
  );
  control.Status = HOST_STATUS.Idle;
  await ensureAivoiceConnected(
    control as unknown as Parameters<typeof ensureAivoiceConnected>[0],
    state
  );

  const initCalls = calls.filter((call) => call.startsWith("Initialize:"));
  const hostCalls = calls.filter((call) => call === "GetAvailableHostNames");
  assert.equal(initCalls.length, 1);
  assert.equal(hostCalls.length, 1);
});

test("ensureAivoiceConnected fails when host names are empty", async () => {
  const calls: string[] = [];
  const control: FakeControl = {
    Status: HOST_STATUS.NotConnected,
    Version: "",
    GetAvailableHostNames: () => {
      calls.push("GetAvailableHostNames");
      return [];
    },
    Initialize: () => {},
    StartHost: () => {},
    Connect: () => {},
    VoiceNames: ["VoiceA"],
    VoicePresetNames: ["PresetA"],
    CurrentVoicePresetName: "PresetA",
    Text: "",
    SaveAudioToFile: () => {},
  };
  const state = createAivoiceState();

  await assert.rejects(
    () =>
      ensureAivoiceConnected(
        control as unknown as Parameters<typeof ensureAivoiceConnected>[0],
        state
      ),
    /A\.I\.VOICE/
  );
});

test("resolveVoicePresetName handles auto and unknown presets", () => {
  const voiceNames = ["Alpha", "Beta"];
  const presetNames = ["Alpha - Default", "Beta - Default"];

  assert.equal(resolveVoicePresetName(presetNames, voiceNames, "auto"), "Alpha");
  assert.equal(resolveVoicePresetName(presetNames, voiceNames, "  "), "Alpha");
  assert.equal(resolveVoicePresetName(presetNames, voiceNames, "Beta"), "Beta");
});
