// Streaming chat completion (SSE) via the OpenAI-compatible endpoint.
//
//   node chat-stream.mjs "explain quantum tunneling in 2 sentences"
//
// The backend chunks the final Gemini response and emits OpenAI-shaped
// `data: { ... "delta": { "content": "..." } }` frames followed by
// `data: [DONE]`.

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:9516";
const MODEL = process.env.MODEL || "gemini-flash";
const ACCOUNT_ID = process.env.ACCOUNT_ID || undefined;

const prompt = process.argv.slice(2).join(" ").trim() || "Stream a haiku about Vietnam";

const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
  body: JSON.stringify({
    model: MODEL,
    stream: true,
    account_id: ACCOUNT_ID,
    messages: [{ role: "user", content: prompt }]
  })
});

if (!res.ok || !res.body) {
  console.error(`HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}

console.log("→ prompt:", prompt);
process.stdout.write("← ");

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let full = "";

outer: while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") break outer;
    try {
      const obj = JSON.parse(payload);
      const piece = obj?.choices?.[0]?.delta?.content;
      if (typeof piece === "string" && piece.length) {
        process.stdout.write(piece);
        full += piece;
      }
    } catch {
      // ignore malformed frame
    }
  }
}

console.log(`\n\n(received ${full.length} chars)`);
