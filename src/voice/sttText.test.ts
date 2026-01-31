import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSttText } from "./sttText";

test("normalizeSttText returns null for empty text", () => {
  assert.equal(normalizeSttText(""), null);
  assert.equal(normalizeSttText("   "), null);
  assert.equal(normalizeSttText("\n\t"), null);
});

test("normalizeSttText trims and keeps non-empty text", () => {
  assert.equal(normalizeSttText("  こんにちは  "), "こんにちは");
});
