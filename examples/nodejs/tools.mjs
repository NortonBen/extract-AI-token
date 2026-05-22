// Chat completion with OpenAI-style tools (function calling).
//
//   node tools.mjs
//
// The backend injects tool specs into the Gemini prompt and parses
// `tool_calls` from the assistant JSON response.

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:9516";
const MODEL = process.env.MODEL || "gemini-flash";
const ACCOUNT_ID = process.env.ACCOUNT_ID || undefined;

const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    stream: false,
    account_id: ACCOUNT_ID,
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" }
            },
            required: ["city"]
          }
        }
      }
    ],
    messages: [{ role: "user", content: "What is the weather in Hanoi?" }]
  })
});

if (!res.ok) {
  console.error(`HTTP ${res.status}:`, await res.text());
  process.exit(1);
}

const data = await res.json();
const choice = data?.choices?.[0];
console.log("finish_reason:", choice?.finish_reason);
console.log("content:", choice?.message?.content);
console.log("tool_calls:", JSON.stringify(choice?.message?.tool_calls, null, 2));
