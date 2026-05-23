import {
  installStreamDebugGlobal,
  isStreamDebugEnabled,
  streamDebugLog,
  STREAM_CONTROL_EVENT,
  STREAM_DEBUG_STORAGE_KEY
} from "../src/lib/gemini-stream-debug";

const SEND_SELECTORS = [
  "gem-icon-button.send-button button[aria-label='Gửi tin nhắn']",
  "gem-icon-button.send-button button[aria-label='Send message']",
  "send-button button[aria-label='Gửi tin nhắn']",
  "send-button button[aria-label='Send message']",
  "send-button button",
  "button.send-button",
  "div.send-button-container.visible button[aria-label='Gửi tin nhắn']",
  "div.send-button-container.visible button[aria-label='Send message']",
  "div.send-button-container button[aria-label='Gửi tin nhắn']",
  "div.send-button-container button[aria-label='Send message']",
  "button[aria-label='Gửi tin nhắn']",
  "button[aria-label='Send message']",
  "button[aria-label*='Gửi']",
  "button[aria-label*='Send']",
  "button[data-test-id*='send']",
  "button[mat-icon-button][aria-label*='end']",
  "button[mat-icon-button][aria-label*='ửi']",
  "div.send-button-container button",
  "footer button[type='button']",
  "button[type='submit']"
];

const LOADING_SELECTORS = [
  ".bard-avatar.thinking",
  ".stop-button-container.visible",
  "button[aria-label='Stop response']",
  "button[aria-label='Dừng phản hồi']",
  "button[aria-label*='Stop']",
  "button[aria-label*='Dừng']",
  "model-response[loading]",
  "[data-test-id='response-loading']"
];

const COMPOSER_SELECTORS = [
  "rich-textarea div[contenteditable='true']",
  "div[role='textbox'][contenteditable='true']",
  "[contenteditable='true'][aria-label*='Gemini']",
  "[contenteditable='true'][aria-label*='prompt']",
  "[contenteditable='true'][aria-label*='lệnh']",
  "[contenteditable='true'][data-placeholder]",
  "div.text-input-field-main-area rich-textarea div.ql-editor[contenteditable='true']",
  "footer rich-textarea div.ql-editor[contenteditable='true']",
  "footer div.ql-editor[contenteditable='true']",
  "chat-app footer div.ql-editor[contenteditable='true']",
  "rich-textarea .ql-editor[contenteditable='true']",
  "div.ql-editor[contenteditable='true']",
  "textarea[aria-label='Enter a prompt here']",
  "textarea[aria-label='Nhập câu lệnh tại đây']",
  "textarea"
];

const RESPONSE_SELECTORS = [
  "message-content",
  "[data-test-id='response-content']",
  "model-response"
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNodeVisible(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isUsableComposer(node: HTMLElement): boolean {
  if (!isNodeVisible(node)) return false;
  if (!(node instanceof HTMLTextAreaElement) && node.getAttribute("contenteditable") !== "true") return false;
  if (node.getAttribute("aria-hidden") === "true") return false;
  const rect = node.getBoundingClientRect();
  if (rect.bottom < window.innerHeight * 0.45) return false;
  return true;
}

function findBottomComposer(): HTMLElement | null {
  const editors: HTMLElement[] = [];
  for (const selector of COMPOSER_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => editors.push(el));
  }
  document.querySelectorAll<HTMLElement>("[contenteditable='true']").forEach((el) => editors.push(el));
  if (editors.length === 0) return null;
  let best: HTMLElement | null = null;
  let bestBottom = -1;
  for (const el of editors) {
    if (!isUsableComposer(el)) continue;
    const bottom = el.getBoundingClientRect().bottom;
    if (bottom > bestBottom) {
      bestBottom = bottom;
      best = el;
    }
  }
  return best ?? editors[editors.length - 1];
}

function messageContentCount(): number {
  return document.querySelectorAll("message-content").length;
}

const NEW_CHAT_SELECTORS = [
  'a[aria-label="Cuộc trò chuyện mới"]',
  'a[aria-label="New chat"]',
  'a[aria-label="New conversation"]',
  "a.gem-nav-list-item[href='/app']",
  "a.gem-nav-list-item[href=\"/app\"]",
  "a.mat-mdc-list-item[href='/app']"
];

function isOnNewChatPage(): boolean {
  try {
    return /^(?:\/u\/\d+)?\/app\/?$/.test(new URL(location.href).pathname);
  } catch {
    return false;
  }
}

function findNewChatLink(): HTMLAnchorElement | null {
  for (const sel of NEW_CHAT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLAnchorElement && isNodeVisible(el)) return el;
  }
  for (const a of document.querySelectorAll<HTMLAnchorElement>(
    "a.gem-nav-list-item[href='/app'], a[href='/app']"
  )) {
    if (!isNodeVisible(a)) continue;
    const label = (a.getAttribute("aria-label") || a.textContent || "").toLowerCase();
    if (
      label.includes("mới") ||
      label.includes("new") ||
      label.includes("cuộc trò chuyện") ||
      label.includes("conversation")
    ) {
      return a;
    }
  }
  return null;
}

function clickElement(el: HTMLElement): void {
  el.focus();
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  el.click();
}

function clickNewConversation(): boolean {
  const link = findNewChatLink();
  if (!link) return false;
  if (link.getAttribute("aria-current") === "page" && isOnNewChatPage() && isComposerEmpty()) {
    return true;
  }
  clickElement(link);
  return true;
}

function clickSendButton(): boolean {
  for (const sel of SEND_SELECTORS) {
    const btn = document.querySelector(sel);
    if (!(btn instanceof HTMLElement)) continue;
    if (!isNodeVisible(btn)) continue;
    if (btn.getAttribute("disabled") !== null) continue;
    if (btn.getAttribute("aria-disabled") === "true") continue;
    clickElement(btn);
    return true;
  }
  return false;
}

function pressEnterFallback(): void {
  const editor = findBottomComposer();
  if (!editor) return;
  editor.focus();
  const opts: KeyboardEventInit = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true
  };
  editor.dispatchEvent(new KeyboardEvent("keydown", opts));
  editor.dispatchEvent(new KeyboardEvent("keypress", opts));
  editor.dispatchEvent(new KeyboardEvent("keyup", opts));
}

function clearComposer(): boolean {
  const editor = findBottomComposer();
  if (!editor) return false;
  editor.focus();
  if (editor instanceof HTMLTextAreaElement) {
    editor.value = "";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    return true;
  }
  editor.innerHTML = "";
  editor.textContent = "";
  editor.dispatchEvent(
    new InputEvent("input", { bubbles: true, composed: true, cancelable: true, inputType: "deleteContentBackward" })
  );
  return true;
}

function isComposerEmpty(): boolean {
  const editor = findBottomComposer();
  if (!editor) return true;
  return !(editor.innerText || editor.textContent || (editor instanceof HTMLTextAreaElement ? editor.value : "")).trim();
}

function setComposerPrompt(prompt: string): boolean {
  const editor = findBottomComposer();
  if (!editor) return false;
  editor.focus();
  if (editor instanceof HTMLTextAreaElement) {
    editor.value = prompt;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
    return true;
  }
  editor.innerHTML = "";
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  document.execCommand("insertText", false, prompt);
  if (!(editor.innerText || editor.textContent || "").trim()) {
    editor.textContent = prompt;
  }
  editor.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      cancelable: true,
      inputType: "insertText",
      data: prompt
    })
  );
  return true;
}

function hasLoadingIndicator(): boolean {
  for (const sel of LOADING_SELECTORS) {
    if (document.querySelector(sel)) return true;
  }
  return false;
}

function clickStopButton(): boolean {
  for (const sel of LOADING_SELECTORS) {
    const btn = document.querySelector(sel);
    if (!(btn instanceof HTMLElement)) continue;
    if (!isNodeVisible(btn)) continue;
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerType: "mouse" }));
    btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    btn.click();
    return true;
  }
  return false;
}

function isPromptSubmitted(prevCount: number, originalPrompt: string): { ok: boolean; reason: string } {
  const current = messageContentCount();
  if (current > prevCount) return { ok: true, reason: "message-content increased" };
  if (hasLoadingIndicator()) return { ok: true, reason: "loading indicator visible" };

  const editor = findBottomComposer();
  const composerText = (editor?.innerText || editor?.textContent || "").trim();
  if (!composerText) return { ok: true, reason: "composer cleared" };
  // Composer text changed (e.g. cleared then placeholder re-rendered) => assume sent
  if (composerText !== originalPrompt.trim()) {
    return { ok: true, reason: "composer text changed" };
  }
  return { ok: false, reason: "waiting submit confirmation" };
}

const NOISE_SELECTORS = [
  "button",
  ".code-block-decoration",
  ".message-content-footer",
  ".message-actions",
  ".response-actions",
  ".buttons",
  ".sr-only",
  ".visually-hidden",
  ".cdk-visually-hidden",
  "[aria-hidden='true']"
].join(",");

const SR_LABEL_PREFIX_RE =
  /^\s*Gemini\s+(?:đã\s+nói|said)\s*[:：]?\s*/i;

function extractCleanText(node: Element): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(NOISE_SELECTORS).forEach((w) => w.remove());
  // Keep <response-element> — for plain-text responses it IS the content wrapper.
  return (clone.innerText || clone.textContent || "")
    .replace(SR_LABEL_PREFIX_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickInnerResponseNode(root: Element): Element {
  return (
    root.querySelector("div[class*='markdown-main-panel']") ||
    root.querySelector("div[class*='markdown']") ||
    root.querySelector(".markdown") ||
    root.querySelector("[data-test-id='response-content-element']") ||
    root.querySelector(".response-content") ||
    root.querySelector("message-content") ||
    root
  );
}

function latestResponseText(): string {
  for (const selector of RESPONSE_SELECTORS) {
    const list = document.querySelectorAll(selector);
    if (list.length === 0) continue;
    const last = list.item(list.length - 1);
    const inner = pickInnerResponseNode(last);
    const text = extractCleanText(inner);
    if (text) return text;
  }
  return "";
}

/** HTML for backend `format=md` (non-stream), like old readLastHTML + bash extract. */
function latestResponseHtml(): string {
  for (const selector of RESPONSE_SELECTORS) {
    const list = document.querySelectorAll(selector);
    if (list.length === 0) continue;
    const last = list.item(list.length - 1);
    const inner = pickInnerResponseNode(last);
    const clone = inner.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(NOISE_SELECTORS).forEach((w) => w.remove());
    const html = (clone.innerHTML || "").trim();
    if (html) return html;
  }
  return "";
}

function normalizeGeminiRootFromLocation(href: string): { pageRoot: string; userIndex: number | null } {
  const url = new URL(href);
  const m = url.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
  if (m) {
    const userIndex = Number(m[1]);
    return { pageRoot: `${url.origin}/u/${userIndex}/app`, userIndex };
  }
  return { pageRoot: `${url.origin}/app`, userIndex: null };
}

function extractEmailFromAriaLabel(label: string): string {
  const match = label.match(/\(([^)]+@[^)]+)\)/);
  return match ? match[1].trim() : "";
}

function detectGeminiAccountPreview() {
  const anchor = document.querySelector<HTMLAnchorElement>(".mavatar-footer-row a.mavatar-footer-left");
  if (!anchor) throw new Error("Cannot find Gemini account footer. Open left menu in Gemini and try again.");

  const { pageRoot, userIndex } = normalizeGeminiRootFromLocation(window.location.href);
  const ariaLabel = anchor.getAttribute("aria-label") || "";
  const displayName =
    (anchor.querySelector(".mavatar-user-name")?.textContent || "").trim() ||
    ariaLabel.replace(/^Tài khoản Google:\s*/i, "").split("(")[0].trim();
  const email = extractEmailFromAriaLabel(ariaLabel);
  const avatarUrl = (anchor.querySelector<HTMLImageElement>(".mavatar-image")?.src || "").trim();
  const tier = (anchor.querySelector(".mavatar-tier-label")?.textContent || "").trim();

  return {
    pageRoot,
    userIndex,
    displayName,
    email,
    avatarUrl,
    tier
  };
}

/**
 * Wait for a DOM condition to become true. Uses MutationObserver instead of
 * setTimeout polling — important when the Gemini tab is in the background,
 * because Chrome throttles setTimeout/setInterval to ~1/min but does NOT
 * throttle MutationObserver callbacks.
 */
interface WaitOptions {
  onTick?: () => void;
  /**
   * Require the condition to remain true for this many ms of DOM quiet
   * before resolving. Useful when the underlying content is streaming and
   * we should not commit the first transient pass.
   */
  stableForMs?: number;
}

function waitForDomCondition<T>(
  test: () => T | null,
  timeoutMs: number,
  description: string,
  options: WaitOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const { onTick, stableForMs = 0 } = options;
    let settled = false;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;

    const finishWith = (value: T) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      if (stableTimer !== undefined) clearTimeout(stableTimer);
      resolve(value);
    };

    const scheduleStable = (value: T) => {
      if (stableTimer !== undefined) clearTimeout(stableTimer);
      if (stableForMs <= 0) {
        finishWith(value);
        return;
      }
      stableTimer = setTimeout(() => {
        // Re-check at the end of the quiet window in case content shifted.
        const fresh = test();
        if (fresh !== null) finishWith(fresh);
        else stableTimer = undefined;
      }, stableForMs);
    };

    const tryFinish = () => {
      if (settled) return;
      if (onTick) {
        try {
          onTick();
        } catch {
          // ignore tick side-effect errors
        }
      }
      const value = test();
      if (value !== null) {
        scheduleStable(value);
      } else if (stableTimer !== undefined) {
        // Condition flipped back to false — restart the stability window.
        clearTimeout(stableTimer);
        stableTimer = undefined;
      }
    };

    const observer = new MutationObserver(tryFinish);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "aria-disabled", "disabled", "class", "loading"]
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      if (stableTimer !== undefined) clearTimeout(stableTimer);
      reject(new Error(`${description} timeout`));
    }, timeoutMs);
    tryFinish();
  });
}

async function waitForPromptSubmission(prevCount: number, originalPrompt: string): Promise<void> {
  let clickAttempts = 0;
  await waitForDomCondition(
    () => (isPromptSubmitted(prevCount, originalPrompt).ok ? true : null),
    25_000,
    "submission",
    {
      onTick: () => {
        // Re-click periodically while observer keeps firing — capped attempts
        // so we don't spam if Gemini is genuinely working on it.
        if (clickAttempts < 4 && !isPromptSubmitted(prevCount, originalPrompt).ok) {
          if (!clickSendButton()) pressEnterFallback();
          clickAttempts += 1;
        }
      }
    }
  );
}

async function waitForResponseStable(_prevCount: number): Promise<string> {
  // MutationObserver-driven: resolve when Gemini stops generating
  // (loading indicator gone) AND has text AND nothing changed for ~2s.
  // The stability window protects against catching the first streamed
  // chunk while Gemini briefly drops the loading indicator between updates.
  const { responseText } = await waitForDomCondition<{ responseText: string }>(
    () => {
      if (hasLoadingIndicator()) return null;
      const text = latestResponseText().trim();
      if (!text) return null;
      return { responseText: text };
    },
    180_000,
    "response",
    { stableForMs: 2000 }
  );
  return responseText;
}

// ---------------------------------------------------------------------------
// Stream interceptor bridge.
// stream-intercept.content.ts (MAIN world) patches window.fetch and posts
// structured events to window when Gemini's StreamGenerate fetch produces
// streaming data. We listen for those events here (isolated world) and
// expose a Promise-based API to consume the latest active stream.
// ---------------------------------------------------------------------------

interface StreamState {
  requestId: string | null;
  text: string;
  status: string;
  done: boolean;
  errored: boolean;
  /** True once StreamGenerate hook fired (old routeStarted). */
  routeStarted: boolean;
  doneResolvers: Array<(text: string) => void>;
}

type StreamDeltaHandler = (delta: string, fullText: string) => void;
const streamDeltaHandlers: StreamDeltaHandler[] = [];

function subscribeStreamDeltas(handler: StreamDeltaHandler): () => void {
  streamDeltaHandlers.push(handler);
  return () => {
    const idx = streamDeltaHandlers.indexOf(handler);
    if (idx >= 0) streamDeltaHandlers.splice(idx, 1);
  };
}

function emitStreamDelta(delta: string, fullText: string): void {
  for (const handler of streamDeltaHandlers.slice()) {
    try {
      handler(delta, fullText);
    } catch {
      // ignore consumer errors
    }
  }
}

const streamState: StreamState = {
  requestId: null,
  text: "",
  status: "",
  done: false,
  errored: false,
  routeStarted: false,
  doneResolvers: []
};

/** Sync arm/disarm via DOM event (MAIN world listens). postMessage arm was async → race with StreamGenerate. */
function armStreamInterceptor(requestId: string): void {
  document.dispatchEvent(
    new CustomEvent(STREAM_CONTROL_EVENT, {
      detail: { action: "arm", requestId },
      bubbles: true
    })
  );
  streamDebugLog("content", "arm_sync", { requestId });
}

function disarmStreamInterceptor(): void {
  document.dispatchEvent(
    new CustomEvent(STREAM_CONTROL_EVENT, {
      detail: { action: "disarm" },
      bubbles: true
    })
  );
  streamDebugLog("content", "disarm_sync");
}

function resetStreamState(): void {
  streamState.requestId = null;
  streamState.text = "";
  streamState.status = "";
  streamState.done = false;
  streamState.errored = false;
  streamState.routeStarted = false;
  // Note: we keep doneResolvers because callers may have already queued
  // a wait before reset (e.g. when resetting at the very start of send).
}

function fireDoneResolvers(text: string): void {
  const resolvers = streamState.doneResolvers.slice();
  streamState.doneResolvers.length = 0;
  for (const r of resolvers) {
    try {
      r(text);
    } catch {
      // ignore consumer errors
    }
  }
}

/**
 * Tracks how many StreamGenerate fetch/XHR requests are currently in flight
 * inside the page (reported by the MAIN-world interceptor via postMessage).
 * Background.ts uses this through `gemini.tab.busy_check` to decide whether
 * it's safe to reload the page (must be 0 — otherwise the request is
 * aborted mid-stream).
 */
let activeStreamCount = 0;
type IdleResolver = () => void;
const idleResolvers: IdleResolver[] = [];

function setActiveStreamCount(n: number): void {
  if (!Number.isFinite(n) || n < 0) return;
  const prev = activeStreamCount;
  activeStreamCount = n;
  if (n === 0 && prev !== 0) {
    const resolvers = idleResolvers.splice(0);
    for (const r of resolvers) {
      try {
        r();
      } catch {
        // ignore
      }
    }
  }
}

function waitForStreamIdle(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (activeStreamCount === 0) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (idle: boolean) => {
      if (done) return;
      done = true;
      const idx = idleResolvers.indexOf(onIdle);
      if (idx >= 0) idleResolvers.splice(idx, 1);
      clearTimeout(timer);
      resolve(idle);
    };
    const onIdle: IdleResolver = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    idleResolvers.push(onIdle);
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data) return;

  if ((data as { __geminiStreamDebugRelay?: boolean }).__geminiStreamDebugRelay === true) {
    const relay = data as {
      layer?: string;
      event?: string;
      detail?: Record<string, unknown>;
    };
    streamDebugLog(String(relay.layer || "intercept"), String(relay.event || "debug"), relay.detail);
    return;
  }

  if ((data as { __geminiStream?: boolean }).__geminiStream !== true) return;
  const payload = data as {
    type: string;
    requestId: string;
    text?: string;
    delta?: string;
    status?: string;
    error?: string;
  };

  switch (payload.type) {
    case "armed":
      streamDebugLog("content", "bridge_armed", { requestId: payload.requestId });
      break;
    case "start":
      streamDebugLog("content", "bridge_start", { requestId: payload.requestId });
      streamState.requestId = payload.requestId;
      streamState.text = "";
      streamState.status = "";
      streamState.done = false;
      streamState.errored = false;
      streamState.routeStarted = true;
      break;
    case "delta": {
      streamState.routeStarted = true;
      streamState.requestId = streamState.requestId || payload.requestId;
      const fullText = typeof payload.text === "string" ? payload.text : streamState.text;
      streamState.text = fullText;
      const delta = typeof payload.delta === "string" ? payload.delta : "";
      if (delta) {
        streamDebugLog("content", "bridge_delta", {
          requestId: payload.requestId,
          deltaLen: delta.length,
          fullLen: fullText.length
        });
        emitStreamDelta(delta, fullText);
      }
      break;
    }
    case "status":
      if (typeof payload.status === "string") streamState.status = payload.status;
      break;
    case "error":
      streamState.errored = true;
      streamState.done = true;
      fireDoneResolvers(streamState.text);
      break;
    case "done":
      if (typeof payload.text === "string" && payload.text) streamState.text = payload.text;
      streamState.done = true;
      streamDebugLog("content", "bridge_done", {
        requestId: payload.requestId,
        textLen: streamState.text.length
      });
      fireDoneResolvers(streamState.text);
      break;
    case "active-count": {
      const count = (payload as { count?: number }).count;
      if (typeof count === "number") setActiveStreamCount(count);
      break;
    }
  }
});

function waitForStreamDone(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (streamState.done) {
      resolve(streamState.text.trim() ? streamState.text : null);
      return;
    }
    let resolved = false;
    const onDone = (text: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(text.trim() ? text : null);
    };
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      const idx = streamState.doneResolvers.indexOf(onDone);
      if (idx >= 0) streamState.doneResolvers.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
    streamState.doneResolvers.push(onDone);
  });
}

async function prepareTabForNextChat(): Promise<{
  ok: boolean;
  composerCleared: boolean;
  newChatOpened: boolean;
}> {
  resetStreamState();
  disarmStreamInterceptor();
  if (hasLoadingIndicator()) clickStopButton();
  await sleep(150);

  const prevCount = messageContentCount();
  const needsNewChat = !isOnNewChatPage() || prevCount > 0 || !isComposerEmpty();

  let newChatOpened = false;
  if (needsNewChat) {
    newChatOpened = clickNewConversation();
    if (newChatOpened) {
      try {
        await waitForDomCondition(
          () => {
            const navLink = findNewChatLink();
            if (navLink?.getAttribute("aria-current") === "page" && isComposerEmpty()) return true;
            if (isOnNewChatPage() && isComposerEmpty() && messageContentCount() <= prevCount) return true;
            return null;
          },
          12_000,
          "new chat"
        );
      } catch {
        // best effort — still clear composer below
      }
    }
  } else {
    newChatOpened = true;
  }

  clearComposer();
  await sleep(100);
  return { ok: true, composerCleared: isComposerEmpty(), newChatOpened };
}

async function sendGeminiPrompt(
  prompt: string,
  options?: {
    onDelta?: (delta: string, fullText: string) => void;
    /** Backend stream_id — arms MAIN-world interceptor (old activeCh). */
    streamId?: string;
  }
): Promise<{ responseText: string }> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt is empty");
  resetStreamState();
  const armId = options?.streamId || `req-${Date.now()}`;
  armStreamInterceptor(armId);
  const unsubscribeDelta = options?.onDelta ? subscribeStreamDeltas(options.onDelta) : () => {};
  const prevCount = messageContentCount();
  try {
    const injected = setComposerPrompt(trimmed);
    if (!injected) throw new Error("Gemini composer not found");

    await sleep(150);
    if (!clickSendButton()) pressEnterFallback();
    await waitForPromptSubmission(prevCount, trimmed);

    // Race stream hook vs DOM. Old: 12s DOM fallback if Route never started.
    const streamFirst = waitForStreamDone(180_000).then((text) =>
      text ? { source: "stream", text } : null
    );
    const domFirst = waitForResponseStable(prevCount).then((text) => ({
      source: "dom",
      text
    }));
    const routeTimeoutFallback = new Promise<{ source: string; text: string } | null>((resolve) => {
      setTimeout(async () => {
        if (streamState.routeStarted) {
          resolve(null);
          return;
        }
        try {
          const text = await waitForResponseStable(prevCount);
          resolve(text.trim() ? { source: "dom-fallback", text } : null);
        } catch {
          resolve(null);
        }
      }, 12_000);
    });

    let winner: { source: string; text: string } | null = null;
    try {
      winner = await Promise.any([
        streamFirst.then((r) => (r ? r : Promise.reject(new Error("no stream")))),
        domFirst,
        routeTimeoutFallback.then((r) => (r ? r : Promise.reject(new Error("no route fallback"))))
      ]);
    } catch (err) {
      if (err instanceof AggregateError) {
        throw err.errors[err.errors.length - 1] || new Error("No response from Gemini");
      }
      throw err;
    }
    if (!winner || !winner.text.trim()) {
      throw new Error("Gemini returned empty response");
    }
    streamDebugLog("content", "send_winner", {
      source: winner.source,
      routeStarted: streamState.routeStarted,
      textLen: winner.text.length
    });
    const responseHtml =
      winner.source === "stream" ? "" : latestResponseHtml();
    return { responseText: winner.text, responseHtml };
  } finally {
    unsubscribeDelta();
    disarmStreamInterceptor();
  }
}

async function executeGeminiCommand(payload: {
  command: "ping" | "detect_account" | "send_prompt" | "read_response";
  prompt?: string;
}) {
  switch (payload.command) {
    case "ping":
      return { command: "ping", ok: true };
    case "detect_account":
      return { command: "detect_account", ok: true, preview: detectGeminiAccountPreview() };
    case "send_prompt": {
      const result = await sendGeminiPrompt(String(payload.prompt || ""));
      return { command: "send_prompt", ok: true, responseText: result.responseText };
    }
    case "read_response":
      return { command: "read_response", ok: true, responseText: latestResponseText() };
    default:
      return { command: payload.command, ok: false, error: "Unsupported command" };
  }
}

export default defineContentScript({
  matches: ["https://gemini.google.com/*"],
  main() {
    const w = window as Window & { __extractTokenContentInit?: boolean };
    if (w.__extractTokenContentInit) return;
    w.__extractTokenContentInit = true;

    installStreamDebugGlobal("content");
    if (isStreamDebugEnabled()) {
      chrome.storage.local.set({ [STREAM_DEBUG_STORAGE_KEY]: "1" }).catch(() => {});
    }

    chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
      if (message?.type === "gemini.chat.send") {
        const prompt = String(message.payload?.prompt || "");
        sendGeminiPrompt(prompt)
          .then((result) => sendResponse(result))
          .catch((error: unknown) =>
            sendResponse({
              responseText: "",
              error: error instanceof Error ? error.message : "Unknown error"
            })
          );
        return true;
      }
      if (message?.type === "gemini.chat.send_stream") {
        const prompt = String(message.payload?.prompt || "");
        const streamId = String(message.payload?.streamId || "");
        const onDelta = (delta: string, full: string) => {
          if (!streamId) return;
          chrome.runtime
            .sendMessage({
              type: "gemini.stream.push",
              payload: { streamId, event: "delta", delta, text: full }
            })
            .catch(() => {});
        };
        sendGeminiPrompt(prompt, { onDelta, streamId })
          .then((result) => {
            if (streamId) {
              chrome.runtime
                .sendMessage({
                  type: "gemini.stream.push",
                  payload: { streamId, event: "done", text: result.responseText }
                })
                .catch(() => {});
            }
            sendResponse(result);
          })
          .catch((error: unknown) => {
            const err = error instanceof Error ? error.message : "Unknown error";
            if (streamId) {
              chrome.runtime
                .sendMessage({
                  type: "gemini.stream.push",
                  payload: { streamId, event: "error", error: err }
                })
                .catch(() => {});
            }
            sendResponse({ responseText: "", error: err });
          });
        return true;
      }
      if (message?.type === "gemini.account.detect") {
        try {
          sendResponse({ ok: true, preview: detectGeminiAccountPreview() });
        } catch (error: unknown) {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Cannot detect Gemini account info"
          });
        }
        return true;
      }
      if (message?.type === "gemini.chat.stop") {
        const clicked = clickStopButton();
        sendResponse({ ok: true, clicked });
        return true;
      }
      if (message?.type === "gemini.tab.busy_check") {
        sendResponse({
          ok: true,
          busy: activeStreamCount > 0,
          activeCount: activeStreamCount
        });
        return true;
      }
      if (message?.type === "gemini.tab.wait_idle") {
        const timeoutMs = Number(message.payload?.timeoutMs) || 15000;
        waitForStreamIdle(timeoutMs).then((idle) => {
          sendResponse({ ok: true, idle, activeCount: activeStreamCount });
        });
        return true;
      }
      if (message?.type === "gemini.chat.prepare") {
        prepareTabForNextChat()
          .then((result) => sendResponse(result))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              composerCleared: false,
              newChatOpened: false,
              error: error instanceof Error ? error.message : "Prepare failed"
            })
          );
        return true;
      }
      if (message?.type === "gemini.command.execute") {
        executeGeminiCommand({
          command: message.payload?.command,
          prompt: message.payload?.prompt
        })
          .then((res) => sendResponse(res))
          .catch((error: unknown) =>
            sendResponse({
              command: message.payload?.command || "ping",
              ok: false,
              error: error instanceof Error ? error.message : "Command execution failed"
            })
          );
        return true;
      }
    });
  }
});
