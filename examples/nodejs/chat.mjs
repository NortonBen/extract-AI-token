// Non-streaming chat completion via the OpenAI-compatible endpoint.
//
//   node chat.mjs "what time is it?"
//
// Env:
//   BASE_URL     default http://127.0.0.1:9516
//   MODEL        default gemini-flash
//   ACCOUNT_ID   optional — pin to a specific configured Gemini account

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:9516";
const MODEL = process.env.MODEL || "gemini-flash";
const ACCOUNT_ID = process.env.ACCOUNT_ID || undefined;

const prompt = process.argv.slice(2).join(" ").trim() || "Hi! Who are you?";

const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    account_id: ACCOUNT_ID,
    messages: [{ role: "user", content: prompt }]
  })
});

if (!res.ok) {
  const errBody = await res.text();
  console.error(`HTTP ${res.status}: ${errBody}`);
  process.exit(1);
}

const data = await res.json();
const text = data?.choices?.[0]?.message?.content ?? "";
console.log("→ prompt:", prompt);
console.log("← response:", text);
