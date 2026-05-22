# Node.js examples

Minimal scripts calling the Extract AI Token backend.

## Prerequisites

- Node.js 18+ (uses built-in `fetch` + WHATWG `ReadableStream`).
- The Extract AI Token desktop app running (macOS / Windows / Linux), with the
  backend listening on `127.0.0.1:9516` (default) and at least one **enabled**
  Gemini account configured via the Chrome extension.

## Setup

```bash
cd examples/nodejs
npm install     # only needed for openai-sdk.mjs
```

## Scripts

| Script | What it does |
|---|---|
| `chat.mjs` | One-shot `POST /v1/chat/completions` (non-stream) using `fetch`. |
| `chat-stream.mjs` | Same endpoint with `stream: true`, parses SSE chunks. |
| `accounts.mjs` | GETs `/v1/accounts`, `/v1/admin/models`, `/v1/history`, `/v1/busy`, `/v1/dashboard`. |
| `openai-sdk.mjs` | Same calls via the official `openai` SDK (drop-in). |
| `tools.mjs` | `POST /v1/chat/completions` with `tools` + `tool_calls` response. |

## Environment variables

| Var | Default | Used by |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:9516` | all scripts |
| `MODEL` | `gemini-flash` | chat scripts |
| `ACCOUNT_ID` | first enabled account | chat scripts |
| `STREAM` | `0` | `openai-sdk.mjs` (`STREAM=1` for SSE) |

## Quick start

```bash
# Health check & overview
node accounts.mjs

# Non-streaming chat
node chat.mjs "what is the capital of Vietnam?"

# Streaming chat
node chat-stream.mjs "explain SSE in 2 sentences"

# Using the OpenAI SDK
npm install
node openai-sdk.mjs "give me a haiku"
STREAM=1 node openai-sdk.mjs "stream a fun fact"
```

## OpenAI-compatible endpoint reference

```
GET http://127.0.0.1:9516/v1/models
```

Returns OpenAI `list` shape (`object`, `data[]` with `id`, `object`, `created`, `owned_by`).
Used by `client.models.list()` in the OpenAI SDK. Internal model config CRUD uses
`GET/PUT/DELETE /v1/admin/models` instead.

```
POST http://127.0.0.1:9516/v1/chat/completions
Content-Type: application/json

{
  "model": "gemini-flash",
  "stream": false,
  "account_id": "gemini-0",        // optional, pin to specific account
  "messages": [
    { "role": "user", "content": "hi" }
  ]
}
```

`messages[].content` may be a string, `null`, or a multipart array
(`[{ "type": "text", "text": "..." }]`) as sent by the OpenAI SDK.

Optional `tools` array (OpenAI function definitions). When the model returns
tool JSON, the response uses `finish_reason: "tool_calls"` and
`message.tool_calls[]` with `function.arguments` as a JSON string.
Multi-turn tool loops: send `assistant` messages with `tool_calls`, then
`tool` messages with `tool_call_id` + result content.

Response (non-stream) matches OpenAI's `chat.completion` shape:

```json
{
  "id": "chatcmpl-1779439558945",
  "object": "chat.completion",
  "model": "gemini-flash",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

Streaming response is OpenAI SSE: `data: { ... "delta": { "content": "..." } }`
frames followed by `data: [DONE]`.

> Note: this backend ignores `Authorization` headers — the OpenAI SDK still
> requires an `apiKey`, just pass any placeholder string.
