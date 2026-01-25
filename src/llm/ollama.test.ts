import assert from "node:assert/strict";
import { after, test } from "node:test";
import { OLLAMA_API_BASE_URL } from "./ollamaConfig";
import { ensureOllamaRunning, stopOllamaServer } from "./ollamaManager";

const modelName = process.env.OLLAMA_TEST_MODEL ?? "qwen2.5:3b-instruct";
const timeoutSec = Number.parseInt(process.env.OLLAMA_TEST_TIMEOUT_SEC ?? "120", 10);

after(async () => {
  await stopOllamaServer();
});

// Fetch with timeout to avoid hanging tests when Ollama is unresponsive.
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

test(
  "ollama responds and can generate",
  { timeout: timeoutSec * 1000 },
  async () => {
    await ensureOllamaRunning();

    const tagsResponse = await fetchWithTimeout(`${OLLAMA_API_BASE_URL}/api/tags`, 5000);
    assert.ok(tagsResponse.ok, `Ollama tags failed: ${tagsResponse.status}`);
    const tags = (await tagsResponse.json()) as { models?: Array<{ name?: string }> };
    const hasModel = tags.models?.some((model) => model?.name === modelName) ?? false;
    assert.ok(
      hasModel,
      `Model not found: ${modelName}. Run .\\tools\\ollama\\ollama.ps1 pull ${modelName}`
    );

    const chatBody = {
      model: modelName,
      messages: [{ role: "user", content: "Say OK in one short sentence." }],
      stream: false,
      options: { temperature: 0 },
    };
    const chatTimeoutMs = Math.max(30_000, timeoutSec * 1000 - 5000);
    const response = await fetchWithTimeout(`${OLLAMA_API_BASE_URL}/api/chat`, chatTimeoutMs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatBody),
    });
    assert.ok(response.ok, `Ollama chat failed: ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const text = data.message?.content?.trim() ?? "";
    assert.ok(text.length > 0, "Ollama chat returned empty content");
  }
);
