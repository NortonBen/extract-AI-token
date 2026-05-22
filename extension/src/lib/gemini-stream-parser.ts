/**
 * Gemini StreamGenerate parser — port of old/ai-browser-token:
 *   internal/infrastructure/chatrunner/parser/gemini_parser.go
 *   internal/infrastructure/chatrunner/runners/gemini_runner.go (ParseStreamChunk)
 *
 * Flow (old): HTTP body → bufio.Scanner (newline lines) → BashProcessChunk per line.
 * Also: chunkSplitter for length-prefixed frames (`len\n<payload>`).
 */

export const GEMINI_DOM_STREAM_FALLBACK_PREFIX = "__gemini_dom_fallback__:";

export interface GeminiStreamEvent {
  type: "wrb.fr" | "END" | "";
  text: string;
  status: string;
  isDone: boolean;
  conversationId: string;
  responseId: string;
}

export function stripGoogleStreamPrefix(buf: string): string {
  let s = buf;
  if (s.startsWith(")]}'")) {
    s = s.slice(4);
    if (s.startsWith("\n")) s = s.slice(1);
  }
  return s;
}

/** Port of Go chunkSplitter — length-prefixed frame or skip empty length line. */
export function tryChunkSplitter(data: string): {
  advance: number;
  token: string | null;
  needMore: boolean;
} {
  if (!data) return { advance: 0, token: null, needMore: false };

  const newlineIdx = data.indexOf("\n");
  if (newlineIdx < 0) {
    return { advance: 0, token: null, needMore: true };
  }

  const lengthStr = data.slice(0, newlineIdx).trim().replace(/^\[|\]$/g, "");
  if (lengthStr === "") {
    return { advance: newlineIdx + 1, token: null, needMore: false };
  }

  const len = parseInt(lengthStr, 10);
  if (!Number.isFinite(len) || Number.isNaN(len)) {
    return { advance: newlineIdx + 1, token: null, needMore: false };
  }

  const totalLen = newlineIdx + 1 + len;
  if (data.length < totalLen) {
    return { advance: 0, token: null, needMore: true };
  }

  return {
    advance: totalLen,
    token: data.slice(newlineIdx + 1, totalLen),
    needMore: false
  };
}

function extractClassicStatus(inner: unknown[]): string {
  const meta = inner[2];
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const obj7 = (meta as Record<string, unknown>)["7"];
    if (Array.isArray(obj7) && obj7.length > 5 && Array.isArray(obj7[5])) {
      const statusArr = obj7[5] as unknown[];
      if (typeof statusArr[0] === "string") return statusArr[0];
    }
  }
  return "";
}

/** inner[4][0][1][0] — same indices as handleWrbPacket in gemini_parser.go */
function extractClassicText(inner: unknown[]): string {
  if (!Array.isArray(inner[4]) || inner[4].length === 0) return "";
  const a0 = (inner[4] as unknown[])[0];
  if (!Array.isArray(a0) || a0.length < 2) return "";
  const a01 = a0[1];
  if (!Array.isArray(a01) || a01.length === 0) return "";
  if (typeof a01[0] === "string") return a01[0];
  return "";
}

function handleWrbPacket(packet: unknown[]): GeminiStreamEvent | null {
  if (packet.length < 3 || typeof packet[2] !== "string" || !packet[2]) {
    return null;
  }

  let inner: unknown;
  try {
    inner = JSON.parse(packet[2] as string);
    if (typeof inner === "string") inner = JSON.parse(inner);
  } catch {
    return null;
  }
  if (!Array.isArray(inner)) return null;

  const innerArr = inner as unknown[];
  const event: GeminiStreamEvent = {
    type: "wrb.fr",
    text: "",
    status: "",
    isDone: false,
    conversationId: "",
    responseId: ""
  };
  let hasMeaningfulData = false;

  if (Array.isArray(innerArr[1]) && innerArr[1].length >= 2) {
    const ids = innerArr[1] as unknown[];
    if (typeof ids[0] === "string") event.conversationId = ids[0];
    if (typeof ids[1] === "string") event.responseId = ids[1];
  }

  const status = extractClassicStatus(innerArr);
  if (status) {
    event.status = status;
    hasMeaningfulData = true;
  }

  const text = extractClassicText(innerArr);
  if (text) {
    event.text = text;
    hasMeaningfulData = true;
  }

  return hasMeaningfulData ? event : null;
}

/**
 * Port of BashProcessChunk — returns first `wrb.fr` or `e` packet only.
 */
export function bashProcessChunk(chunk: string): GeminiStreamEvent | null {
  const trimmed = chunk.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(GEMINI_DOM_STREAM_FALLBACK_PREFIX)) {
    return {
      type: "",
      text: trimmed.slice(GEMINI_DOM_STREAM_FALLBACK_PREFIX.length),
      status: "",
      isDone: false,
      conversationId: "",
      responseId: ""
    };
  }

  let outer: unknown;
  try {
    outer = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(outer)) return null;

  for (const packet of outer as unknown[][]) {
    if (!Array.isArray(packet) || packet.length === 0) continue;
    const packetType = packet[0];
    if (packetType === "e") {
      return {
        type: "END",
        text: "",
        status: "",
        isDone: true,
        conversationId: "",
        responseId: ""
      };
    }
    if (packetType === "wrb.fr") {
      return handleWrbPacket(packet);
    }
  }
  return null;
}

/**
 * Port of ParseStreamChunk cumulative delta (strings.TrimPrefix + prevText = result.Text).
 */
export function computeDelta(prevText: string, nextText: string): { delta: string; fullText: string } {
  if (!nextText) return { delta: "", fullText: prevText };
  const delta = prevText && nextText.startsWith(prevText) ? nextText.slice(prevText.length) : nextText;
  return { delta, fullText: nextText };
}

/**
 * Feed incremental bytes: chunkSplitter frames + newline scanner (handleStreamRoute).
 * Returns unparsed tail to keep in buffer.
 */
export function feedStreamBuffer(
  buffer: string,
  onEvent: (evt: GeminiStreamEvent) => void
): string {
  let buf = buffer;

  while (true) {
    const { advance, token, needMore } = tryChunkSplitter(buf);
    if (needMore && advance === 0) break;
    if (advance > 0) {
      if (token) {
        const evt = bashProcessChunk(token);
        if (evt) onEvent(evt);
      }
      buf = buf.slice(advance);
      continue;
    }
    break;
  }

  const lines = buf.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const lenCandidate = trimmed.replace(/^\[|\]$/g, "");
    if (/^\d+$/.test(lenCandidate)) continue;
    if (!trimmed.startsWith("[") && !trimmed.startsWith(GEMINI_DOM_STREAM_FALLBACK_PREFIX)) {
      continue;
    }
    const evt = bashProcessChunk(trimmed);
    if (evt) onEvent(evt);
  }
  return rest;
}

// ── Salvage: full body when framing missed (XHR load / tail flush) ─────────────

function walkStrings(node: unknown, out: string[], depth: number): void {
  if (depth > 24) return;
  if (typeof node === "string") {
    const s = node.trim();
    if (s.length >= 2) out.push(s);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkStrings(item, out, depth + 1);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      walkStrings(v, out, depth + 1);
    }
  }
}

function extractFallbackText(inner: unknown[]): string {
  const candidates: string[] = [];
  walkStrings(inner, candidates, 0);
  const filtered = candidates.filter((s) => {
    if (s.length < 2) return false;
    if (/^https?:\/\//i.test(s)) return false;
    if (/^[\d\[\]{}"\\:,]+$/.test(s) && s.length < 40) return false;
    if (s.startsWith("wrb.") || s === "wrb.fr" || s === "e") return false;
    return true;
  });
  filtered.sort((a, b) => b.length - a.length);
  return filtered[0] || "";
}

function parseWrbInnerMerged(inner: unknown[]): Partial<GeminiStreamEvent> {
  const evt: Partial<GeminiStreamEvent> = {};
  if (Array.isArray(inner[1]) && inner[1].length >= 2) {
    const ids = inner[1] as unknown[];
    if (typeof ids[0] === "string") evt.conversationId = ids[0];
    if (typeof ids[1] === "string") evt.responseId = ids[1];
  }
  evt.status = extractClassicStatus(inner);
  evt.text = extractClassicText(inner) || extractFallbackText(inner);
  return evt;
}

/** Merge all packets in one JSON blob (salvage only). */
export function parseGeminiChunkMerged(chunk: string): GeminiStreamEvent | null {
  let outer: unknown;
  try {
    outer = JSON.parse(chunk.trim());
  } catch {
    return null;
  }
  if (!Array.isArray(outer)) return null;

  const merged: GeminiStreamEvent = {
    type: "",
    text: "",
    status: "",
    isDone: false,
    conversationId: "",
    responseId: ""
  };
  let hasData = false;

  for (const packet of outer as unknown[][]) {
    if (!Array.isArray(packet) || packet.length === 0) continue;
    const type = packet[0];
    if (type === "e") {
      merged.type = "END";
      merged.isDone = true;
      hasData = true;
      continue;
    }
    if (type !== "wrb.fr") continue;
    if (packet.length < 3 || typeof packet[2] !== "string" || !packet[2]) continue;

    let inner: unknown;
    try {
      inner = JSON.parse(packet[2] as string);
      if (typeof inner === "string") inner = JSON.parse(inner);
    } catch {
      continue;
    }
    if (!Array.isArray(inner)) continue;

    const part = parseWrbInnerMerged(inner as unknown[]);
    if (part.conversationId) merged.conversationId = part.conversationId;
    if (part.responseId) merged.responseId = part.responseId;
    if (part.status) {
      merged.status = part.status;
      hasData = true;
    }
    if (part.text && part.text.length >= (merged.text?.length ?? 0)) {
      merged.text = part.text;
      merged.type = "wrb.fr";
      hasData = true;
    }
  }

  return hasData || merged.isDone ? merged : null;
}

export function parseStreamBody(body: string): GeminiStreamEvent[] {
  const events: GeminiStreamEvent[] = [];
  const onEvent = (evt: GeminiStreamEvent) => events.push(evt);
  let buf = stripGoogleStreamPrefix(body);
  buf = feedStreamBuffer(buf, onEvent);
  if (buf.trim().startsWith("[")) {
    const evt = parseGeminiChunkMerged(buf.trim());
    if (evt) events.push(evt);
  }
  return events;
}

/** @deprecated Use feedStreamBuffer */
export function feedLengthPrefixed(buffer: string): { rest: string; events: GeminiStreamEvent[] } {
  const events: GeminiStreamEvent[] = [];
  const rest = feedStreamBuffer(buffer, (e) => events.push(e));
  return { rest, events };
}

/** @deprecated Use feedStreamBuffer */
export function feedNewlineLines(buffer: string): { rest: string; events: GeminiStreamEvent[] } {
  return { rest: buffer, events: [] };
}

/** @deprecated Use bashProcessChunk */
export function parseGeminiChunk(chunk: string): GeminiStreamEvent | null {
  return bashProcessChunk(chunk) ?? parseGeminiChunkMerged(chunk);
}
