/**
 * Gemini StreamGenerate URL matching.
 * Example:
 * https://gemini.google.com/u/4/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?...
 */

export function normalizeGeminiRequestUrl(
  url: string,
  base = typeof location !== "undefined" ? location.href : "https://gemini.google.com/"
): string {
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export function isGeminiStreamGenerateUrl(url: string): boolean {
  if (!url) return false;
  const abs = normalizeGeminiRequestUrl(url);
  if (/StreamGenerate/i.test(abs)) return true;
  if (/BardFrontendService/i.test(abs) && /stream/i.test(abs)) return true;
  try {
    const u = new URL(abs);
    const host = u.hostname.toLowerCase();
    if (host !== "gemini.google.com" && !host.endsWith(".gemini.google.com")) {
      return false;
    }
    const path = u.pathname;
    return (
      path.includes("StreamGenerate") ||
      path.includes("assistant.lamda.BardFrontendService")
    );
  } catch {
    return false;
  }
}
