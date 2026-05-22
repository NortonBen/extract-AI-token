// Stream + tools: expect finish_reason tool_calls and delta.tool_calls chunks.
//
//   node tools-stream.mjs

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:9516";
const MODEL = process.env.MODEL || "gemini-flash";
const ACCOUNT_ID = process.env.ACCOUNT_ID || undefined;

const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    stream: true,
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

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let finishReason = null;
const toolCalls = new Map();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") continue;
    const obj = JSON.parse(data);
    const choice = obj?.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const delta = choice?.delta;
    if (typeof delta?.content === "string" && delta.content) {
      process.stdout.write(delta.content);
    }
    const tcs = delta?.tool_calls;
    if (Array.isArray(tcs)) {
      for (const tc of tcs) {
        const idx = tc.index ?? 0;
        if (!toolCalls.has(idx)) {
          toolCalls.set(idx, { id: tc.id, type: tc.type, name: "", arguments: "" });
        }
        const acc = toolCalls.get(idx);
        if (tc.id) acc.id = tc.id;
        if (tc.type) acc.type = tc.type;
        if (tc.function?.name) acc.name = tc.function.name;
        if (typeof tc.function?.arguments === "string") {
          acc.arguments += tc.function.arguments;
        }
      }
    }
  }
}

console.log("\nfinish_reason:", finishReason);
if (toolCalls.size > 0) {
  console.log("tool_calls:", JSON.stringify([...toolCalls.values()], null, 2));
}
