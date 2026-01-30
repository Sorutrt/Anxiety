import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { generateReply } from "./index";
import type { CharacterDefinition } from "../types";

const originalFetch = globalThis.fetch;

const baseCharacter: CharacterDefinition = {
  id: "test",
  displayName: "テスト",
  systemPrompt: "テスト用システム",
  speakingStyle: "短く答える。",
  voicePreset: "auto",
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("OpenRouter失敗時にGeminiへフォールバックする", async () => {
  const originalGeminiModel = process.env.GEMINI_LLM_MODEL;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

  process.env.GEMINI_LLM_MODEL = "gemini-2.5-flash-lite";
  process.env.GEMINI_API_KEY = "dummy";
  process.env.OPENROUTER_API_KEY = "dummy";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.startsWith("https://openrouter.ai/")) {
      return {
        ok: false,
        status: 404,
        text: async () => "404 page not found",
      } as Response;
    }

    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }],
        }),
      } as Response;
    }

    throw new Error(`unexpected url: ${url}`);
  }) as typeof fetch;

  try {
    const reply = await generateReply({
      guildId: "guild",
      model: "openrouter:google/gemma-3-27b-it:free",
      character: baseCharacter,
      history: [],
      userText: "こんにちは",
    });
    assert.equal(reply, "gemini-ok");
  } finally {
    process.env.GEMINI_LLM_MODEL = originalGeminiModel;
    process.env.GEMINI_API_KEY = originalGeminiKey;
    process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
  }
});
