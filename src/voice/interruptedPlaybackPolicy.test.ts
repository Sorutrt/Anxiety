import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInterruptedPlayback,
  shouldResumeInterruptedPlayback,
} from "./interruptedPlaybackPolicy";

test("shouldResumeInterruptedPlayback returns true only for null STT", () => {
  assert.equal(shouldResumeInterruptedPlayback(null), true);
  assert.equal(shouldResumeInterruptedPlayback("あ"), false);
  assert.equal(shouldResumeInterruptedPlayback("こんにちは"), false);
});

test("createInterruptedPlayback snapshots resumable playback with elapsed duration", () => {
  assert.deepEqual(createInterruptedPlayback("voice\\reply.wav", 1234.8, true), {
    filePath: "voice\\reply.wav",
    offsetMs: 1234,
  });
});

test("createInterruptedPlayback rejects non-resumable or zero-duration playback", () => {
  assert.equal(createInterruptedPlayback("voice\\reply.wav", 0, true), null);
  assert.equal(createInterruptedPlayback("voice\\reply.wav", 1200, false), null);
});
