import assert from "node:assert/strict";
import { test } from "node:test";
import type { CharacterDefinition } from "../types";
import { buildOpenRouterParams } from "./openrouter";

function createCharacter(
  overrides: Partial<CharacterDefinition> = {}
): CharacterDefinition {
  return {
    id: "test",
    displayName: "test",
    systemPrompt: "",
    speakingStyle: "",
    voicePreset: "auto",
    ...overrides,
  };
}

test("buildOpenRouterParams uses defaults when params are absent", () => {
  const params = buildOpenRouterParams(createCharacter());
  assert.equal(params.temperature, 0.9);
  assert.equal(params.max_tokens, 220);
});

test("buildOpenRouterParams applies character overrides", () => {
  const params = buildOpenRouterParams(
    createCharacter({
      openrouterParams: {
        temperature: 0.6,
        max_tokens: 320,
      },
    })
  );
  assert.equal(params.temperature, 0.6);
  assert.equal(params.max_tokens, 320);
});
