const SEND_SELECTORS = [
  "gem-icon-button.send-button button[aria-label='Gửi tin nhắn']",
  "div.send-button-container.visible button[aria-label='Gửi tin nhắn']",
  "gem-icon-button.send-button button[aria-label='Send message']",
  "div.send-button-container.visible button[aria-label='Send message']",
  "button[aria-label='Gửi tin nhắn']",
  "button[aria-label='Send message']",
  "button[aria-label*='Gửi']",
  "button[aria-label*='Send']",
  "button[data-test-id*='send']",
  "div.send-button-container button",
  "footer button[type='button']",
  "button[type='submit']"
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

function clickSendButton(): boolean {
  for (const sel of SEND_SELECTORS) {
    const btn = document.querySelector(sel);
    if (!(btn instanceof HTMLElement)) continue;
    if (!isNodeVisible(btn)) continue;
    if (btn.getAttribute("disabled") !== null) continue;
    if (btn.getAttribute("aria-disabled") === "true") continue;
    btn.focus();
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

function pressEnterFallback(): void {
  const editor = findBottomComposer();
  if (!editor) return;
  editor.focus();
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  editor.dispatchEvent(new KeyboardEvent("keypress", { key: "Enter", bubbles: true }));
  editor.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
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

function isPromptSubmitted(prevCount: number): { ok: boolean; reason: string } {
  const current = messageContentCount();
  if (current > prevCount && prevCount >= 0) return { ok: true, reason: "message-content increased" };
  if (document.querySelector(".bard-avatar.thinking")) return { ok: true, reason: "thinking started" };
  const editor = findBottomComposer();
  const composerText = (editor?.innerText || editor?.textContent || "").trim();
  if (!composerText) return { ok: true, reason: "composer cleared" };
  const submitContainer = document.querySelector("div.send-button-container.visible, div.send-button-container.inner");
  const submitContainerReady = submitContainer?.classList.contains("submit") || false;
  if (!submitContainerReady) return { ok: false, reason: "submit container not ready" };

  let sendBtnVisible = false;
  let sendBtnDisabled = false;
  for (const sel of SEND_SELECTORS) {
    const btn = document.querySelector(sel);
    if (!(btn instanceof HTMLElement)) continue;
    if (!isNodeVisible(btn)) continue;
    sendBtnVisible = true;
    sendBtnDisabled = btn.getAttribute("disabled") !== null || btn.getAttribute("aria-disabled") === "true";
    break;
  }
  if (!sendBtnVisible) return { ok: true, reason: "send button hidden" };
  if (sendBtnDisabled) return { ok: true, reason: "send button disabled" };
  return { ok: false, reason: "waiting submit confirmation" };
}

function extractCleanText(node: Element): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".code-block-decoration, .buttons, button, .message-content-footer").forEach((w) => w.remove());
  clone.querySelectorAll("response-element:not(:has(code-block, pre, code))").forEach((w) => w.remove());
  return (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function latestResponseText(): string {
  for (const selector of RESPONSE_SELECTORS) {
    const list = document.querySelectorAll(selector);
    if (list.length === 0) continue;
    const last = list.item(list.length - 1);
    const text = extractCleanText(last);
    if (text) return text;
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

async function waitForPromptSubmission(prevCount: number): Promise<void> {
  for (let second = 1; second <= 18; second += 1) {
    await sleep(1000);
    const check = isPromptSubmitted(prevCount);
    if (check.ok) return;
    if (second <= 6 || second === 8 || second === 10 || second === 12 || second === 15) {
      if (!clickSendButton()) pressEnterFallback();
    }
  }
  throw new Error("Send not confirmed after submission checks");
}

async function waitForResponseStable(prevCount: number): Promise<string> {
  for (let i = 0; i < 60; i += 1) {
    if (messageContentCount() > prevCount) break;
    await sleep(1000);
  }
  for (let i = 0; i < 60; i += 1) {
    if (!document.querySelector(".bard-avatar.thinking")) break;
    await sleep(1000);
  }

  let latest = "";
  let stableRounds = 0;
  for (let i = 0; i < 120; i += 1) {
    await sleep(1000);
    const text = latestResponseText();
    if (!text) continue;
    if (text !== latest) {
      latest = text;
      stableRounds = 0;
      continue;
    }
    stableRounds += 1;
    if (stableRounds >= 3) return latest;
  }
  if (latest.trim()) return latest;
  throw new Error("Timeout waiting Gemini response");
}

async function sendGeminiPrompt(prompt: string): Promise<{ responseText: string }> {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt is empty");
  const prevCount = messageContentCount();
  const injected = setComposerPrompt(trimmed);
  if (!injected) throw new Error("Gemini composer not found");

  if (!clickSendButton()) pressEnterFallback();
  await waitForPromptSubmission(prevCount);
  const responseText = await waitForResponseStable(prevCount);
  if (!responseText.trim()) {
    throw new Error("Gemini returned empty response");
  }
  return { responseText };
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
