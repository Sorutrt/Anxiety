import { LLM_TIMEOUT_SEC } from "../constants";
import { buildChatMessages, buildSystemPrompt, GenerateReplyArgs, retryWithBackoff } from "./common";
import { OLLAMA_API_BASE_URL } from "./ollamaConfig";

// OllamaのチャットAPIを呼び出して応答テキストを取得する。
async function callOllama(args: GenerateReplyArgs, timeoutMs: number): Promise<string> {
  const url = `${OLLAMA_API_BASE_URL}/api/chat`;
  const systemPrompt = buildSystemPrompt(args.character);
  const body = {
    model: args.model,
    messages: buildChatMessages(args.history, args.userText, systemPrompt),
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 512,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Ollama APIエラー: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    message?: { content?: string };
  };
  const text = data.message?.content?.trim() ?? "";
  if (!text) {
    console.warn(
      `[LLM] Ollama empty response detail=${JSON.stringify({
        model: args.model,
        historyCount: args.history.length,
        userTextLength: args.userText.length,
      })}`
    );
    throw new Error("Ollamaの応答が空でした。");
  }
  return text;
}

// Ollamaで返答テキストを生成する。
export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const timeoutMs = LLM_TIMEOUT_SEC * 1000;
  return await retryWithBackoff(() => callOllama(args, timeoutMs), {
    fallbackMessage: "Ollamaの呼び出しに失敗しました。",
  });
}
