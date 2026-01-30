import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOpenRouterMessages } from "./openrouter";

test("buildOpenRouterMessages injects system prompt as user message", () => {
  const messages = buildOpenRouterMessages(
    [
      { role: "user", text: "hi", at: 0 },
      { role: "assistant", text: "yo", at: 1 },
    ],
    "next",
    "SYSTEM"
  );

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "user", "assistant", "user"]
  );
  assert.equal(messages[0]?.content, "SYSTEM");
  assert.equal(messages.at(-1)?.content, "next");
});

test("buildOpenRouterMessages skips empty system prompt", () => {
  const messages = buildOpenRouterMessages(
    [{ role: "user", text: "hi", at: 0 }],
    "next",
    "  "
  );

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "user"]
  );
  assert.equal(messages[0]?.content, "hi");
  assert.equal(messages[1]?.content, "next");
});
