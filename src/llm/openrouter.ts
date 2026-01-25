import { LLM_TIMEOUT_SEC } from "../constants";
import { buildChatMessages, buildSystemPrompt, GenerateReplyArgs, retryWithBackoff } from "./common";

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

// OpenRouterのチャットAPIを呼び出して応答テキストを取得する。
async function callOpenRouter(args: GenerateReplyArgs, timeoutMs: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY が設定されていません。");
  }

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const systemPrompt = buildSystemPrompt(args.character);
  const body = {
    model: args.model,
    messages: buildChatMessages(args.history, args.userText, systemPrompt),
    temperature: 0.7,
    max_tokens: 512,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`OpenRouter APIエラー: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as OpenRouterChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    console.warn(
      `[LLM] OpenRouter empty response detail=${JSON.stringify({
        model: args.model,
        historyCount: args.history.length,
        userTextLength: args.userText.length,
      })}`
    );
    throw new Error("OpenRouterの応答が空でした。");
  }
  return text;
}

// OpenRouterで返答テキストを生成する。
export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const timeoutMs = LLM_TIMEOUT_SEC * 1000;
  return await retryWithBackoff(() => callOpenRouter(args, timeoutMs), {
    fallbackMessage: "OpenRouterの呼び出しに失敗しました。",
  });
}
