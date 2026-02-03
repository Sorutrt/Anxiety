import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TEXT_QUEUE_LIMIT,
  createTextQueueState,
  enqueueTextQueue,
  peekTextQueue,
  shiftTextQueue,
} from "./textQueue";

test("enqueueTextQueue keeps FIFO order", () => {
  const state = createTextQueueState<number>();
  assert.equal(enqueueTextQueue(state, 1), true);
  assert.equal(enqueueTextQueue(state, 2), true);
  assert.equal(peekTextQueue(state), 1);
  assert.equal(shiftTextQueue(state), 1);
  assert.equal(shiftTextQueue(state), 2);
  assert.equal(shiftTextQueue(state), undefined);
});

test("enqueueTextQueue rejects when queue is full", () => {
  const state = createTextQueueState<number>();
  for (let i = 0; i < TEXT_QUEUE_LIMIT; i += 1) {
    assert.equal(enqueueTextQueue(state, i), true);
  }
  assert.equal(enqueueTextQueue(state, 999), false);
});
