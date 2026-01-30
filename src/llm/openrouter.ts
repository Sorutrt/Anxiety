import { LLM_TIMEOUT_SEC } from "../constants";
import type { ChatMessage } from "./common";
import { buildSystemPrompt, GenerateReplyArgs, retryWithBackoff } from "./common";

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

const DEFAULT_OPENROUTER_PARAMS = {
  temperature: 0.9,
  max_tokens: 220,
} as const;

// キャラ設定のOpenRouterパラメータを安全に正規化する。
export function buildOpenRouterParams(
  character: GenerateReplyArgs["character"]
): { temperature: number; max_tokens: number } {
  const params = character.openrouterParams ?? {};
  const toNumber = (value: unknown, fallback: number): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  };
  return {
    temperature: toNumber(params.temperature, DEFAULT_OPENROUTER_PARAMS.temperature),
    max_tokens: Math.max(1, Math.round(toNumber(params.max_tokens, DEFAULT_OPENROUTER_PARAMS.max_tokens))),
  };
}

// OpenRouterはsystemロールが無効なモデルがあるため、systemプロンプトをuserに含める。
export function buildOpenRouterMessages(
  history: GenerateReplyArgs["history"],
  userText: string,
  systemPrompt: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const trimmedSystem = systemPrompt.trim();
  if (trimmedSystem.length > 0) {
    messages.push({ role: "user", content: systemPrompt });
  }
  for (const turn of history) {
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    });
  }
  messages.push({ role: "user", content: userText });
  return messages;
}

// OpenRouterのチャットAPIを呼び出して応答テキストを取得する。
async function callOpenRouter(args: GenerateReplyArgs, timeoutMs: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY が設定されていません。");
  }

  const url = "https://openrouter.ai/api/v1/chat/completions";
  const systemPrompt = buildSystemPrompt(args.character);
  const params = buildOpenRouterParams(args.character);
  const body = {
    model: args.model,
    messages: buildOpenRouterMessages(args.history, args.userText, systemPrompt),
    temperature: params.temperature,
    max_tokens: params.max_tokens,
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
