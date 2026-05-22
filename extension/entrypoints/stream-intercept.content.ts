/**
 * Gemini stream interceptor.
 *
 * Runs in the page's MAIN world at document_start so it can override
 * window.fetch BEFORE Gemini's app code captures the original reference.
 *
 * When a request to a *StreamGenerate* endpoint is detected, the response
 * body is teed: one branch is returned to Gemini's app code unchanged, the
 * other is consumed here to parse the batchexecute frames and dispatch
 * structured events via window.postMessage.
 *
 * The (isolated-world) content script in content.ts listens for these
 * messages and forwards them to the background service worker.
 *
 * Mirrors old/ai-browser-token/internal/infrastructure/chatrunner/parser/gemini_parser.go.
 */

interface GeminiStreamEvent {
  text: string;
  status: string;
  isDone: boolean;
  conversationId: string;
  responseId: string;
}

function parseGeminiChunk(chunk: string): GeminiStreamEvent | null {
  let outer: unknown;
  try {
    outer = JSON.parse(chunk);
  } catch {
    return null;
  }
  if (!Array.isArray(outer)) return null;

  const event: GeminiStreamEvent = {
    text: "",
    status: "",
    isDone: false,
    conversationId: "",
    responseId: ""
  };
  let hasMeaningfulData = false;

  for (const packet of outer as unknown[][]) {
    if (!Array.isArray(packet) || packet.length === 0) continue;
    const type = packet[0];
    if (type === "e") {
      event.isDone = true;
      hasMeaningfulData = true;
      continue;
    }
    if (type !== "wrb.fr") continue;
    if (packet.length < 3 || typeof packet[2] !== "string" || !packet[2]) continue;

    let inner: unknown;
    try {
      inner = JSON.parse(packet[2] as string);
    } catch {
      continue;
    }
    if (!Array.isArray(inner)) continue;

    // Conversation ID & Response ID
    if (Array.isArray(inner[1]) && (inner[1] as unknown[]).length >= 2) {
      const ids = inner[1] as unknown[];
      if (typeof ids[0] === "string") event.conversationId = ids[0];
      if (typeof ids[1] === "string") event.responseId = ids[1];
    }

    // Status (inner[2]["7"][5][0])
    const meta = inner[2];
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const obj7 = (meta as Record<string, unknown>)["7"];
      if (Array.isArray(obj7) && obj7.length > 5 && Array.isArray(obj7[5])) {
        const statusArr = obj7[5] as unknown[];
        if (typeof statusArr[0] === "string") {
          event.status = statusArr[0];
          hasMeaningfulData = true;
        }
      }
    }

    // Text (inner[4][0][1][0])
    if (Array.isArray(inner[4]) && (inner[4] as unknown[]).length > 0) {
      const a0 = (inner[4] as unknown[])[0];
      if (Array.isArray(a0) && a0.length > 1) {
        const a01 = a0[1];
        if (Array.isArray(a01) && a01.length > 0 && typeof a01[0] === "string") {
          event.text = a01[0];
          hasMeaningfulData = true;
        }
      }
    }
  }

  return hasMeaningfulData || event.isDone ? event : null;
}

function emit(payload: Record<string, unknown>): void {
  try {
    window.postMessage({ __geminiStream: true, ...payload }, "*");
  } catch {
    // postMessage cannot throw under normal conditions, but keep it safe
  }
}

async function consumeStreamBranch(stream: ReadableStream<Uint8Array>, requestId: string): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let prevText = "";
  let doneEmitted = false;

  emit({ type: "start", requestId });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Each frame is "<length>\n<payload>", with optional [ ] wrappers per old chunkSplitter.
      while (true) {
        const newlineIdx = buffer.indexOf("\n");
        if (newlineIdx < 0) break;
        const lenRaw = buffer.slice(0, newlineIdx).trim().replace(/^\[|\]$/g, "");
        if (lenRaw === "") {
          buffer = buffer.slice(newlineIdx + 1);
          continue;
        }
        const len = parseInt(lenRaw, 10);
        if (!Number.isFinite(len) || Number.isNaN(len)) {
          buffer = buffer.slice(newlineIdx + 1);
          continue;
        }
        const total = newlineIdx + 1 + len;
        if (buffer.length < total) break;

        const payload = buffer.slice(newlineIdx + 1, total);
        buffer = buffer.slice(total);

        const evt = parseGeminiChunk(payload);
        if (!evt) continue;

        if (evt.status) {
          emit({ type: "status", requestId, status: evt.status });
        }
        if (evt.text) {
          const delta = evt.text.startsWith(prevText)
            ? evt.text.slice(prevText.length)
            : evt.text;
          prevText = evt.text;
          emit({
            type: "delta",
            requestId,
            text: evt.text,
            delta,
            conversationId: evt.conversationId || undefined,
            responseId: evt.responseId || undefined
          });
        }
        if (evt.isDone) {
          doneEmitted = true;
          emit({ type: "done", requestId, text: evt.text || prevText });
        }
      }
    }
  } catch (err) {
    emit({ type: "error", requestId, error: err instanceof Error ? err.message : String(err) });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (!doneEmitted) {
      emit({ type: "done", requestId, text: prevText });
    }
  }
}

// Tracking / ads endpoints that Gemini's app calls but page CSP refuses to
// connect to (visible as "Refused to connect because it violates the
// document's Content Security Policy" errors in the console). We short-circuit
// them here so the browser never dispatches the request and the CSP layer
// stays quiet. We do NOT rely on this for blocking — it's purely to keep the
// console clean and save a few network round-trips.
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

function patchFetch(): void {
  const w = window as unknown as { __geminiStreamPatched?: boolean; fetch: typeof fetch };
  if (w.__geminiStreamPatched) return;
  w.__geminiStreamPatched = true;
  const origFetch = w.fetch.bind(window);

  w.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = "";
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else if (input && typeof (input as Request).url === "string") url = (input as Request).url;

    if (isNoopUrl(url)) {
      return emptyOkResponse(url);
    }

    const isStream = /StreamGenerate/i.test(url);
    const response = await origFetch(input as RequestInfo, init);
    if (!isStream || !response.body) return response;

    try {
      const [appBranch, ourBranch] = response.body.tee();
      const requestId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      consumeStreamBranch(ourBranch, requestId).catch(() => {
        // already emitted error event
      });
      return new Response(appBranch, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      // tee or Response construction failed — return original, no intercept
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
    this: XMLHttpRequest & { __geminiNoop?: boolean; __geminiUrl?: string },
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    const urlStr = typeof url === "string" ? url : url.toString();
    this.__geminiNoop = isNoopUrl(urlStr);
    this.__geminiUrl = urlStr;
    if (this.__geminiNoop) {
      // Replace target with a harmless data: URL so the underlying XHR never
      // touches the tracker host and CSP never fires.
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
    this: XMLHttpRequest & { __geminiNoop?: boolean },
    body?: Document | XMLHttpRequestBodyInit | null
  ): void {
    if (this.__geminiNoop) {
      // Fire and forget — data: URL resolves instantly.
      origSend.call(this);
      return;
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

/**
 * Keep the page in "visible / focused" mode even when the tab is backgrounded.
 *
 * Chrome still throttles setTimeout/setInterval at the engine level when the
 * tab is truly hidden, but a lot of web apps (Gemini included) also gate
 * their own work on document.visibilityState — pausing streams, deferring
 * UI updates, or short-circuiting fetch handlers. Spoofing the API keeps
 * those code paths active. Combined with our MutationObserver-driven
 * detector in content.ts (which is not throttled), this gives reliable
 * background behaviour without having to activate the tab.
 */
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
      // not configurable in some browsers — ignore
    }
  }

  try {
    document.hasFocus = function hasFocus() {
      return true;
    } as typeof document.hasFocus;
  } catch {
    // ignore
  }

  // Drop visibilitychange/freeze listeners on document/window so Gemini's
  // app code never learns the tab was backgrounded.
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

  // Some libraries assign to onvisibilitychange/onblur directly. Stub them.
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
    patchVisibility();
    patchFetch();
    patchXHR();
    patchBeacon();
  }
});
