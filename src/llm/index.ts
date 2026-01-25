import { GenerateReplyArgs } from "./common";
import { generateReply as generateGeminiReply } from "./gemini";
import { generateReply as generateOllamaReply } from "./ollama";

type LlmProvider = "gemini" | "ollama";

type ParsedLlmConfig = {
  provider: LlmProvider;
  model: string;
};

// LLMの指定文字列からプロバイダとモデル名を抽出する。
function parseLlmSpec(spec: string): ParsedLlmConfig {
  const trimmed = spec.trim();
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex > 0) {
    const prefix = trimmed.slice(0, separatorIndex).toLowerCase();
    const model = trimmed.slice(separatorIndex + 1).trim();
    if ((prefix === "gemini" || prefix === "ollama") && model.length > 0) {
      return { provider: prefix, model };
    }
  }
  return { provider: "gemini", model: trimmed };
}

// LLMプロバイダに応じて返答生成処理を切り替える。
export async function generateReply(args: GenerateReplyArgs): Promise<string> {
  const parsed = parseLlmSpec(args.model);
  const providerArgs = { ...args, model: parsed.model };
  if (parsed.provider === "ollama") {
    return await generateOllamaReply(providerArgs);
  }
  return await generateGeminiReply(providerArgs);
}
