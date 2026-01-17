import { LLM_TIMEOUT_SEC } from "../constants";
import { retryOnce } from "../utils/async";
import { CharacterDefinition, ConversationTurn } from "../types";

type GenerateReplyArgs = {
  guildId: string;
  model: string;
  character: CharacterDefinition;
  history: ConversationTurn[];
  userText: string;
};

type GeminiContent = {
  role: "user" | "model";
  parts: { text: string }[];
};

function buildSystemPrompt(character: CharacterDefinition): string {
  return [
    character.systemPrompt,
    character.speakingStyle,
    "出力条件:",
    "- 日本語",
    "- 2〜4文、300文字以内",
    "- 質問は最大1つ",
    "- @everyone/@hereは禁止",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function buildContents(history: ConversationTurn[], userText: string): GeminiContent[] {
  const contents: GeminiContent[] = history.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.text }],
  }));
  contents.push({ role: "user", parts: [{ text: userText }] });
  return contents;
}

async function callGemini(args: GenerateReplyArgs, timeoutMs: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません。");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(args.character) }],
    },
    contents: buildContents(args.history, args.userText),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 512,
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
    throw new Error(`Gemini APIエラー: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new Error("Geminiの応答が空でした。");
  }

  return text;
}

// Gemini APIで返答テキストを生成する。
export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const timeoutMs = LLM_TIMEOUT_SEC * 1000;
  return await retryOnce(() => callGemini(args, timeoutMs));
}
