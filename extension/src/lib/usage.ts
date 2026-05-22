/** Lightweight token estimate (matches backend tokens.rs). */
export function estimateTextTokens(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const wordBased = t.split(/\s+/).filter(Boolean).length;
  const runeBased = Math.ceil([...t].length / 4);
  return Math.max(wordBased, runeBased);
}
