import assert from "node:assert/strict";
import { test } from "node:test";
import { SpeechIndicatorState } from "./speechIndicatorState";

test("drops utterance when total on time is <= 0.3s", () => {
  const state = new SpeechIndicatorState({ minOnMs: 300, gapMs: 300 });
  state.start(0);
  state.onIndicatorOff(200);

  assert.equal(state.shouldEnd(499), false);
  assert.equal(state.shouldEnd(500), true);

  const result = state.complete(500);
  assert.equal(result.totalOnMs, 200);
  assert.equal(result.isValid, false);
});

test("treats 0.3s exactly as invalid", () => {
  const state = new SpeechIndicatorState({ minOnMs: 300, gapMs: 300 });
  state.start(0);
  state.onIndicatorOff(300);

  const result = state.complete(600);
  assert.equal(result.totalOnMs, 300);
  assert.equal(result.isValid, false);
});

test("splits utterance after 0.3s silence", () => {
  const state = new SpeechIndicatorState({ minOnMs: 300, gapMs: 300 });
  state.start(0);
  state.onIndicatorOff(500);

  assert.equal(state.shouldEnd(799), false);
  assert.equal(state.shouldEnd(800), true);

  const result = state.complete(800);
  assert.equal(result.totalOnMs, 500);
  assert.equal(result.isValid, true);
});

test("keeps same utterance if re-on within 0.3s", () => {
  const state = new SpeechIndicatorState({ minOnMs: 300, gapMs: 300 });
  state.start(0);
  state.onIndicatorOff(500);

  state.onIndicatorOn(700);
  assert.equal(state.shouldEnd(800), false);

  state.onIndicatorOff(900);
  assert.equal(state.shouldEnd(1199), false);
  assert.equal(state.shouldEnd(1200), true);

  const result = state.complete(1200);
  assert.equal(result.totalOnMs, 700);
  assert.equal(result.isValid, true);
});
