type RunThinkingFillerStepArgs<T> = {
  fillerText: string | null;
  playFiller: (text: string) => Promise<void>;
  generateReply: () => Promise<T>;
};

// THINKING中の場つなぎ再生と本返答生成を並行で進め、両方の完了を待つ。
export async function runThinkingFillerStep<T>({
  fillerText,
  playFiller,
  generateReply,
}: RunThinkingFillerStepArgs<T>): Promise<T> {
  const fillerPromise = fillerText === null ? Promise.resolve() : playFiller(fillerText);
  const replyPromise = generateReply();
  const [, reply] = await Promise.all([fillerPromise, replyPromise]);
  return reply;
}

export function selectThinkingFiller(
  fillerPhrases: string[],
  selectionIndex: number
): string | null {
  const candidates = fillerPhrases.map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 0);
  if (candidates.length === 0) {
    return null;
  }
  const normalizedIndex = Math.abs(selectionIndex) % candidates.length;
  return candidates[normalizedIndex] ?? null;
}
