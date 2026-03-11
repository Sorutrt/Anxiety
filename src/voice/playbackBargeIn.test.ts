import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getPlaybackBargeInDelayMs,
  hasReachedPlaybackBargeInThreshold,
} from "./playbackBargeIn";
import { SpeechIndicatorState } from "./speechIndicatorState";

test("interrupts playback when speech reaches 0.3s", () => {
  const state = new SpeechIndicatorState({ minOnMs: 800, gapMs: 500 });
  state.start(0);

  assert.equal(getPlaybackBargeInDelayMs(state, 0, 300), 300);
  assert.equal(getPlaybackBargeInDelayMs(state, 299, 300), 1);
  assert.equal(hasReachedPlaybackBargeInThreshold(state, 299, 300), false);
  assert.equal(getPlaybackBargeInDelayMs(state, 300, 300), 0);
  assert.equal(hasReachedPlaybackBargeInThreshold(state, 300, 300), true);
});

test("does not keep interruption timer while indicator is off", () => {
  const state = new SpeechIndicatorState({ minOnMs: 800, gapMs: 500 });
  state.start(0);
  state.onIndicatorOff(120);

  assert.equal(getPlaybackBargeInDelayMs(state, 200, 300), null);
  assert.equal(hasReachedPlaybackBargeInThreshold(state, 200, 300), false);
});

test("resumes interruption countdown after a short gap", () => {
  const state = new SpeechIndicatorState({ minOnMs: 800, gapMs: 500 });
  state.start(0);
  state.onIndicatorOff(200);
  state.onIndicatorOn(250);

  assert.equal(getPlaybackBargeInDelayMs(state, 250, 300), 100);
  assert.equal(hasReachedPlaybackBargeInThreshold(state, 349, 300), false);
  assert.equal(getPlaybackBargeInDelayMs(state, 350, 300), 0);
  assert.equal(hasReachedPlaybackBargeInThreshold(state, 350, 300), true);
});
