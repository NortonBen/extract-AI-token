/**
 * Gemini stream interceptor (MAIN world, document_start).
 *
 * Mirrors old/ai-browser-token Playwright StreamGenerate route + gemini_parser.go:
 * - armed ⇔ activeCh (sync CustomEvent from content.ts)
 * - fetch: tee() pass-through to app (like route.Fulfill body)
 * - XHR: progressive responseText (like bufio.Scanner lines on resp.Body)
 * - Parser: chunkSplitter + BashProcessChunk + ParseStreamChunk cumulative delta
 *
 * Debug: localStorage `extract-token-stream-debug` = `1` — see docs/STREAM_INTERCEPT_DEBUG.md
 */

import {
  emitInterceptDebug,
  installStreamDebugGlobal,
  isStreamDebugEnabled,
  STREAM_CONTROL_EVENT,
  truncateUrl
} from "../src/lib/gemini-stream-debug";
import {
  computeDelta,
  feedStreamBuffer,
  parseStreamBody,
  stripGoogleStreamPrefix,
  type GeminiStreamEvent
} from "../src/lib/gemini-stream-parser";
import { isGeminiStreamGenerateUrl, normalizeGeminiRequestUrl } from "../src/lib/gemini-stream-url";

function dbg(event: string, detail?: Record<string, unknown>): void {
  emitInterceptDebug(event, detail);
}

interface ActiveSession {
  requestId: string;
  prevText: string;
  routeStarted: boolean;
  streamDone: boolean;
}

function emit(payload: Record<string, unknown>): void {
  try {
    window.postMessage({ __geminiStream: true, ...payload }, "*");
  } catch {
    // ignore
  }
}

function newRequestId(): string {
  return `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let activeSession: ActiveSession | null = null;

function isArmed(): boolean {
  return activeSession !== null;
}

function armSession(requestId?: string): string {
  const id = requestId || newRequestId();
  activeSession = { requestId: id, prevText: "", routeStarted: false, streamDone: false };
  dbg("arm", { requestId: id });
  return id;
}

function disarmSession(): void {
  dbg("disarm", {
    hadSession: activeSession !== null,
    routeStarted: activeSession?.routeStarted ?? false
  });
  activeSession = null;
}

function markRouteStarted(): void {
  if (activeSession) activeSession.routeStarted = true;
}

/** Emit delta/done from a parsed event (cumulative text → delta like old ParseStreamChunk). */
function emitParsedEvent(session: ActiveSession, evt: GeminiStreamEvent): void {
  markRouteStarted();
  const { requestId } = session;

  if (evt.status) {
    emit({ type: "status", requestId, status: evt.status });
  }

  if (evt.text) {
    const { delta, fullText } = computeDelta(session.prevText, evt.text);
    session.prevText = fullText;
    if (delta) {
      dbg("delta_emit", {
        requestId,
        deltaLen: delta.length,
        fullLen: fullText.length,
        status: evt.status || undefined
      });
      emit({
        type: "delta",
        requestId,
        text: fullText,
        delta,
        conversationId: evt.conversationId || undefined,
        responseId: evt.responseId || undefined
      });
    }
  }

  if (evt.isDone) {
    const finalText = evt.text || session.prevText;
    session.prevText = "";
    session.streamDone = true;
    emit({ type: "done", requestId, text: finalText });
  }
}

function feedStreamText(chunk: string, session: ActiveSession, requestId: string): void {
  const w = window as unknown as {
    __geminiStreamBuf?: Record<string, string>;
    __geminiStreamBufStripped?: Record<string, boolean>;
  };
  if (!w.__geminiStreamBuf) w.__geminiStreamBuf = {};
  let buffer = (w.__geminiStreamBuf[requestId] || "") + chunk;
  if (!w.__geminiStreamBufStripped?.[requestId]) {
    const before = buffer.length;
    buffer = stripGoogleStreamPrefix(buffer);
    w.__geminiStreamBufStripped = w.__geminiStreamBufStripped || {};
    w.__geminiStreamBufStripped[requestId] = true;
    if (before !== buffer.length) {
      dbg("strip_xssi_prefix", { requestId, removed: before - buffer.length });
    }
  }
  buffer = feedStreamBuffer(buffer, (evt) => emitParsedEvent(session, evt));
  w.__geminiStreamBuf[requestId] = buffer;
}

function flushStreamBuffer(requestId: string): void {
  const w = window as unknown as {
    __geminiStreamBuf?: Record<string, string>;
    __geminiStreamBufStripped?: Record<string, boolean>;
  };
  const session = activeSession;
  if (!session) return;
  let tail = w.__geminiStreamBuf?.[requestId] || "";
  if (tail) {
    tail = feedStreamBuffer(tail, (evt) => emitParsedEvent(session, evt));
    w.__geminiStreamBuf![requestId] = tail;
  }
  if (w.__geminiStreamBuf) delete w.__geminiStreamBuf[requestId];
  if (w.__geminiStreamBufStripped) delete w.__geminiStreamBufStripped[requestId];
}

async function consumeStreamBranch(stream: ReadableStream<Uint8Array>, requestId: string): Promise<void> {
  const session = activeSession;
  if (!session || session.requestId !== requestId) return;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let doneEmitted = false;

  emit({ type: "start", requestId });
  markRouteStarted();
  dbg("consume_start", { requestId, transport: "fetch-tee" });

  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value?.length ?? 0;
      feedStreamText(decoder.decode(value, { stream: true }), session, requestId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbg("consume_error", { requestId, error: msg });
    emit({ type: "error", requestId, error: msg });
    doneEmitted = true;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    const wbuf = window as unknown as { __geminiStreamBuf?: Record<string, string> };
    const tail = wbuf.__geminiStreamBuf?.[requestId] || "";
    if (!session.prevText && tail.trim()) {
      const events = parseStreamBody(tail);
      for (const evt of events) emitParsedEvent(session, evt);
      dbg("fetch_parse_salvage", { requestId, eventCount: events.length, textLen: session.prevText.length });
    }
    flushStreamBuffer(requestId);
    dbg("consume_end", {
      requestId,
      bytesRead,
      textLen: session.prevText.length,
      tailLen: tail.length,
      tailPreview: isStreamDebugEnabled() ? tail.slice(0, 400) : undefined
    });
    if (!doneEmitted && !session.streamDone) {
      const text = session.prevText;
      session.prevText = "";
      emit({ type: "done", requestId, text });
    }
  }
}

type GeminiXHR = XMLHttpRequest & {
  __geminiParsedPos?: number;
  __geminiXHRStarted?: boolean;
  __geminiXHRFinishing?: boolean;
};

function processXHRProgress(xhr: GeminiXHR, requestId: string): void {
  const session = activeSession;
  if (!session || session.requestId !== requestId) return;

  const full = typeof xhr.responseText === "string" ? xhr.responseText : "";
  if (!full) return;

  if (!xhr.__geminiXHRStarted) {
    xhr.__geminiXHRStarted = true;
    emit({ type: "start", requestId });
    markRouteStarted();
    xhr.__geminiParsedPos = 0;
    dbg("xhr_progress_start", { requestId });
  }

  const pos = xhr.__geminiParsedPos || 0;
  const chunk = full.slice(pos);
  if (chunk) {
    feedStreamText(chunk, session, requestId);
    xhr.__geminiParsedPos = full.length;
  }
}

function finishXHRStream(xhr: GeminiXHR, requestId: string): void {
  const session = activeSession;
  if (!session || session.requestId !== requestId) return;
  if (xhr.__geminiXHRFinishing) return;
  xhr.__geminiXHRFinishing = true;

  const full = typeof xhr.responseText === "string" ? xhr.responseText : "";
  try {
    processXHRProgress(xhr, requestId);
    flushStreamBuffer(requestId);

    if (!session.prevText && full.length > 0) {
      dbg("parse_salvage", { requestId, bodyLen: full.length });
      const events = parseStreamBody(full);
      for (const evt of events) emitParsedEvent(session, evt);
      dbg("parse_salvage_result", {
        requestId,
        eventCount: events.length,
        textLen: session.prevText.length,
        bodyPreview: isStreamDebugEnabled() ? full.slice(0, 500) : undefined
      });
    }

    if (!session.streamDone) {
      const finalText = session.prevText;
      session.prevText = "";
      session.streamDone = true;
      dbg("xhr_stream_done", {
        requestId,
        bodyLen: full.length,
        textLen: finalText.length,
        parseEmpty: finalText.length === 0 && full.length > 0
      });
      if (finalText.length === 0 && full.length > 0 && isStreamDebugEnabled()) {
        dbg("parse_empty", {
          requestId,
          bodyLen: full.length,
          bodyPreview: full.slice(0, 800)
        });
      }
      emit({ type: "done", requestId, text: finalText });
    }
  } catch (err) {
    emit({ type: "error", requestId, error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Control: sync CustomEvent from isolated content.ts (like old activeCh).
// ---------------------------------------------------------------------------

document.addEventListener(
  STREAM_CONTROL_EVENT,
  (event) => {
    const detail = (event as CustomEvent<{ action?: string; requestId?: string }>).detail;
    if (!detail) return;
    if (detail.action === "arm") {
      const id = armSession(detail.requestId);
      emit({ type: "armed", requestId: id });
      return;
    }
    if (detail.action === "disarm") {
      disarmSession();
    }
  },
  true
);

// ---------------------------------------------------------------------------
// fetch / XHR / noop / visibility (unchanged behaviour for ads + background tab)
// ---------------------------------------------------------------------------

const NOOP_HOST_SUFFIXES = [
  "googleadservices.com",
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "googlesyndication.com",
  "g.doubleclick.net",
  "stats.g.doubleclick.net"
];

function isNoopUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, location.href);
    const host = u.hostname.toLowerCase();
    return NOOP_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix));
  } catch {
    return false;
  }
}

function emptyOkResponse(url: string): Response {
  return new Response("", {
    status: 204,
    statusText: "No Content",
    headers: { "x-gemini-intercept": "noop", "x-gemini-noop-url": url.slice(0, 120) }
  });
}

function resolveFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return normalizeGeminiRequestUrl(input);
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return "";
}

function patchFetch(): void {
  const w = window as unknown as { __geminiStreamPatched?: boolean; fetch: typeof fetch };
  if (w.__geminiStreamPatched) return;
  w.__geminiStreamPatched = true;
  const origFetch = w.fetch.bind(window);

  w.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = resolveFetchUrl(input);

    if (isNoopUrl(url)) return emptyOkResponse(url);

    const isStream = isGeminiStreamGenerateUrl(url);
    if (isStream) {
      dbg("fetch_stream_seen", {
        url: truncateUrl(url, 200),
        armed: isArmed(),
        requestId: activeSession?.requestId
      });
    }
    const response = await origFetch(input as RequestInfo, init);

    if (!isStream) return response;
    if (!response.body) {
      dbg("fetch_pass_no_body", { url: truncateUrl(url, 200) });
      return response;
    }
    if (!isArmed()) {
      dbg("fetch_pass_not_armed", { url: truncateUrl(url, 200) });
      return response;
    }

    try {
      const session = activeSession!;
      const requestId = session.requestId;
      dbg("fetch_stream_tee", { requestId, url: truncateUrl(url, 200) });
      const [appBranch, ourBranch] = response.body.tee();
      consumeStreamBranch(ourBranch, requestId).catch((err: unknown) => {
        dbg("consume_unhandled", {
          requestId,
          error: err instanceof Error ? err.message : String(err)
        });
      });
      return new Response(appBranch, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };
}

function patchXHR(): void {
  const w = window as unknown as { __geminiXHRPatched?: boolean };
  if (w.__geminiXHRPatched) return;
  w.__geminiXHRPatched = true;

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & {
      __geminiNoop?: boolean;
      __geminiUrl?: string;
      __geminiStream?: boolean;
    },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    const urlStr = normalizeGeminiRequestUrl(typeof url === "string" ? url : url.toString());
    this.__geminiNoop = isNoopUrl(urlStr);
    this.__geminiUrl = urlStr;
    this.__geminiStream = isGeminiStreamGenerateUrl(urlStr);
    if (this.__geminiNoop) {
      origOpen.call(
        this,
        method,
        "data:text/plain;charset=utf-8,",
        ...(rest as [boolean?, string?, string?])
      );
      return;
    }
    origOpen.call(this, method, urlStr, ...(rest as [boolean?, string?, string?]));
  } as typeof XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & {
      __geminiNoop?: boolean;
      __geminiUrl?: string;
      __geminiStream?: boolean;
      __geminiStreamHooked?: boolean;
    },
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    if (this.__geminiNoop) {
      origSend.call(this);
      return;
    }

    if (this.__geminiStream) {
      dbg("xhr_stream_seen", {
        url: truncateUrl(this.__geminiUrl || "", 200),
        armed: isArmed()
      });
    }

    if (this.__geminiStream && isArmed() && !this.__geminiStreamHooked) {
      this.__geminiStreamHooked = true;
      const requestId = activeSession!.requestId;
      const xhr = this as GeminiXHR;
      xhr.addEventListener("readystatechange", () => {
        try {
          if (xhr.readyState < 3) return;
          processXHRProgress(xhr, requestId);
          if (xhr.readyState === 4) finishXHRStream(xhr, requestId);
        } catch {
          // ignore
        }
      });
    }

    origSend.call(this, body as XMLHttpRequestBodyInit);
  } as typeof XMLHttpRequest.prototype.send;
}

function patchBeacon(): void {
  const w = window as unknown as { __geminiBeaconPatched?: boolean };
  if (w.__geminiBeaconPatched) return;
  w.__geminiBeaconPatched = true;
  if (!navigator.sendBeacon) return;
  const orig = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (isNoopUrl(urlStr)) return true;
    return orig(urlStr, data);
  };
}

function patchVisibility(): void {
  const w = window as unknown as { __geminiVisibilityPatched?: boolean };
  if (w.__geminiVisibilityPatched) return;
  w.__geminiVisibilityPatched = true;

  const visibleProps: Array<[string, unknown]> = [
    ["hidden", false],
    ["visibilityState", "visible"],
    ["webkitHidden", false],
    ["webkitVisibilityState", "visible"],
    ["wasDiscarded", false]
  ];
  for (const [prop, value] of visibleProps) {
    try {
      Object.defineProperty(document, prop, {
        configurable: true,
        get: () => value
      });
    } catch {
      // ignore
    }
  }

  try {
    document.hasFocus = function hasFocus() {
      return true;
    } as typeof document.hasFocus;
  } catch {
    // ignore
  }

  const blockedTypes = new Set([
    "visibilitychange",
    "webkitvisibilitychange",
    "freeze",
    "resume",
    "pagehide",
    "blur"
  ]);
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (
      (this === document || this === window) &&
      typeof type === "string" &&
      blockedTypes.has(type.toLowerCase())
    ) {
      return;
    }
    return origAdd.call(this, type, listener as EventListener, options);
  } as typeof EventTarget.prototype.addEventListener;

  const stubProps: Array<[Document | Window, string]> = [
    [document, "onvisibilitychange"],
    [document, "onwebkitvisibilitychange"],
    [document, "onfreeze"],
    [document, "onresume"],
    [window, "onblur"],
    [window, "onpagehide"]
  ];
  for (const [target, prop] of stubProps) {
    try {
      Object.defineProperty(target, prop, {
        configurable: true,
        get: () => null,
        set: () => {
          /* swallow */
        }
      });
    } catch {
      // ignore
    }
  }
}

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    const w = window as Window & {
      __geminiStreamPatched?: boolean;
      __geminiXHRPatched?: boolean;
      __geminiVisibilityPatched?: boolean;
      __extractTokenStreamProbe?: () => {
        fetchPatched: boolean;
        xhrPatched: boolean;
        visibilityPatched: boolean;
        armed: boolean;
        requestId: string | null;
        href: string;
      };
    };

    installStreamDebugGlobal("intercept");
    patchVisibility();
    patchFetch();
    patchXHR();
    patchBeacon();

    w.__extractTokenStreamProbe = () => ({
      fetchPatched: Boolean(w.__geminiStreamPatched),
      xhrPatched: Boolean(w.__geminiXHRPatched),
      visibilityPatched: Boolean(w.__geminiVisibilityPatched),
      armed: isArmed(),
      requestId: activeSession?.requestId ?? null,
      href: location.href
    });

    dbg("patches_installed", {
      debug: isStreamDebugEnabled(),
      href: location.href,
      fetchPatched: Boolean(w.__geminiStreamPatched),
      pattern: "BardFrontendService/StreamGenerate"
    });
  }
});
