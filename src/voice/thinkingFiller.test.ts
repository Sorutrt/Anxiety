import assert from "node:assert/strict";
import { test } from "node:test";
import { runThinkingFillerStep, selectThinkingFiller } from "./thinkingFiller";

test("selectThinkingFiller returns null when no candidates exist", () => {
  assert.equal(selectThinkingFiller([], 0), null);
  assert.equal(selectThinkingFiller(["", "   "], 1), null);
});

test("selectThinkingFiller picks a deterministic phrase from candidates", () => {
  const fillers = ["えっと", "うーん", "そうですね"];

  assert.equal(selectThinkingFiller(fillers, 0), "えっと");
  assert.equal(selectThinkingFiller(fillers, 1), "うーん");
  assert.equal(selectThinkingFiller(fillers, 2), "そうですね");
  assert.equal(selectThinkingFiller(fillers, 3), "えっと");
});

test("runThinkingFillerStep waits for both filler playback and reply generation", async () => {
  const calls: string[] = [];
  let finishFiller: (() => void) | undefined;
  let finishReply: (() => void) | undefined;

  const resultPromise = runThinkingFillerStep({
    fillerText: "えっと",
    playFiller: async (text) => {
      calls.push(`play:${text}`);
      await new Promise<void>((resolve) => {
        finishFiller = () => {
          calls.push("filler:done");
          resolve();
        };
      });
    },
    generateReply: async () => {
      calls.push("reply:start");
      await new Promise<void>((resolve) => {
        finishReply = () => {
          calls.push("reply:done");
          resolve();
        };
      });
      return "本返答";
    },
  });

  await Promise.resolve();
  assert.deepEqual(calls, ["play:えっと", "reply:start"]);

  finishReply?.();
  await Promise.resolve();
  assert.deepEqual(calls, ["play:えっと", "reply:start", "reply:done"]);

  finishFiller?.();
  const result = await resultPromise;
  assert.equal(result, "本返答");
  assert.deepEqual(calls, ["play:えっと", "reply:start", "reply:done", "filler:done"]);
});

test("runThinkingFillerStep skips playback when fillerText is null", async () => {
  let played = false;

  const result = await runThinkingFillerStep({
    fillerText: null,
    playFiller: async () => {
      played = true;
    },
    generateReply: async () => "本返答",
  });

  assert.equal(result, "本返答");
  assert.equal(played, false);
});
