// STTの生テキストを正規化し、入力なしを判定する。
export function normalizeSttText(rawText: string): string | null {
  const trimmed = rawText.trim();
  return trimmed.length > 1 ? trimmed : null;
}
