import { CharacterDefinition, ConversationTurn } from "../types";

export type GenerateReplyArgs = {
  guildId: string;
  model: string;
  character: CharacterDefinition;
  history: ConversationTurn[];
  userText: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// LLM共通のシステムプロンプトを組み立てる。
export function buildSystemPrompt(character: CharacterDefinition): string {
  return [
    character.systemPrompt,
    character.speakingStyle,
    "常にプロンプトのすべての記述を考慮する。",
    "私は声で話し、人が話しているような文章のみを生成します。フィラー（つなぎ表現）を適度に織り交ぜます。",
    "「なにかお手伝いできることはありますか？」「なにかあったらいつでも話してください」のような意味のことは言いません。",
    "出力条件:",
    "- 日本語",
    "- 一言か二言、200文字以内",
    "- 質問は最大1つ",
    "- 絵文字と記号、太字、イタリックを使わない",
    "以下は対話相手の記述です。"
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

// チャット形式のLLM向けメッセージ配列を生成する。
export function buildChatMessages(
  history: ConversationTurn[],
  userText: string,
  systemPrompt: string
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
  for (const turn of history) {
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text,
    });
  }
  messages.push({ role: "user", content: userText });
  return messages;
}

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  fallbackMessage?: string;
};

// LLMの一時的な失敗に備えて指数バックオフ付きで再試行する。
export async function retryWithBackoff<T>(
  task: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const fallbackMessage = options.fallbackMessage ?? "LLMの呼び出しに失敗しました。";

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delayMs = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(fallbackMessage);
}
