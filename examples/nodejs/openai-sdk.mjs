// Use the official OpenAI Node SDK against the Extract AI Token backend.
//
//   npm install
//   node openai-sdk.mjs "say hello in 3 languages"
//
// Toggle STREAM=1 to use server-sent events:
//   STREAM=1 node openai-sdk.mjs "stream me a fun fact"

import OpenAI from "openai";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:9516";
const MODEL = process.env.MODEL || "gemini-flash";
const ACCOUNT_ID = process.env.ACCOUNT_ID || undefined;
const STREAM = process.env.STREAM === "1";

// The backend ignores Authorization headers, but the SDK requires one.
const client = new OpenAI({
  baseURL: `${BASE_URL}/v1`,
  apiKey: "extract-ai-token-no-auth"
});

const prompt = process.argv.slice(2).join(" ").trim() || "Greet me, then list 3 facts.";

console.log("→ prompt:", prompt);

if (STREAM) {
  process.stdout.write("← ");
  const stream = await client.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [{ role: "user", content: prompt }],
    // account_id is a backend extension — pass via extra body.
    ...(ACCOUNT_ID ? { account_id: ACCOUNT_ID } : {})
  });
  let full = "";
  for await (const chunk of stream) {
    const piece = chunk.choices?.[0]?.delta?.content ?? "";
    if (piece) {
      process.stdout.write(piece);
      full += piece;
    }
  }
  console.log(`\n(received ${full.length} chars)`);
} else {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    ...(ACCOUNT_ID ? { account_id: ACCOUNT_ID } : {})
  });
  console.log("← response:", res.choices?.[0]?.message?.content ?? "");
}
