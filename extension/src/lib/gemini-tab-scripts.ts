/**
 * Đảm bảo stream-intercept (MAIN) + content (isolated) có trong tab Gemini.
 * Manifest content_scripts không luôn đủ (tab cũ, channel đóng, SPA reload).
 */

import { streamDebugLog } from "./gemini-stream-debug";

export const STREAM_INTERCEPT_FILE = "content-scripts/stream-intercept.js";
export const CONTENT_SCRIPT_FILE = "content-scripts/content.js";

export interface StreamInterceptProbe {
  fetchPatched: boolean;
  xhrPatched: boolean;
  visibilityPatched: boolean;
  armed: boolean;
  requestId: string | null;
  href: string;
}

const reloadedTabIds = new Set<number>();

function isGeminiUrl(url: string | undefined): boolean {
  return Boolean(url && url.includes("gemini.google.com"));
}

export async function probeStreamIntercept(tabId: number): Promise<StreamInterceptProbe | null> {
  try {
    const [row] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const w = window as Window & {
          __extractTokenStreamProbe?: () => StreamInterceptProbe;
        };
        if (typeof w.__extractTokenStreamProbe === "function") {
          return w.__extractTokenStreamProbe();
        }
        const ww = w as Window & {
          __geminiStreamPatched?: boolean;
          __geminiXHRPatched?: boolean;
          __geminiVisibilityPatched?: boolean;
        };
        return {
          fetchPatched: Boolean(ww.__geminiStreamPatched),
          xhrPatched: Boolean(ww.__geminiXHRPatched),
          visibilityPatched: Boolean(ww.__geminiVisibilityPatched),
          armed: false,
          requestId: null,
          href: location.href
        };
      }
    });
    return (row?.result as StreamInterceptProbe | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function injectStreamIntercept(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [STREAM_INTERCEPT_FILE],
    world: "MAIN",
    injectImmediately: true
  });
}

export async function injectContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [CONTENT_SCRIPT_FILE]
  });
}

async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: "gemini.command.execute",
      payload: { command: "ping" }
    });
    return Boolean(res && (res as { ok?: boolean }).ok);
  } catch {
    return false;
  }
}

/**
 * Inject MAIN intercept + isolated content; reload tab once nếu fetch chưa patch (inject muộn).
 */
export async function ensureGeminiTabScripts(
  tabId: number,
  options?: { allowReload?: boolean }
): Promise<{ intercept: StreamInterceptProbe | null; contentOk: boolean }> {
  const tab = await chrome.tabs.get(tabId);
  if (!isGeminiUrl(tab.url)) {
    return { intercept: null, contentOk: false };
  }

  let intercept = await probeStreamIntercept(tabId);
  if (!intercept?.fetchPatched) {
    try {
      await injectStreamIntercept(tabId);
      intercept = await probeStreamIntercept(tabId);
      streamDebugLog("background", "inject_stream_intercept", {
        tabId,
        fetchPatched: intercept?.fetchPatched ?? false
      });
    } catch (err) {
      streamDebugLog("background", "inject_stream_intercept_failed", {
        tabId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const allowReload = options?.allowReload !== false;
  if (allowReload && !intercept?.fetchPatched && !reloadedTabIds.has(tabId)) {
    reloadedTabIds.add(tabId);
    streamDebugLog("background", "reload_tab_for_intercept", { tabId, url: tab.url });
    await chrome.tabs.reload(tabId);
    await waitTabComplete(tabId, 20_000);
    intercept = await probeStreamIntercept(tabId);
    if (!intercept?.fetchPatched) {
      try {
        await injectStreamIntercept(tabId);
        intercept = await probeStreamIntercept(tabId);
      } catch {
        // ignore
      }
    }
  }

  let contentOk = await pingContentScript(tabId);
  if (!contentOk) {
    try {
      await injectContentScript(tabId);
      contentOk = await pingContentScript(tabId);
      streamDebugLog("background", "inject_content", { tabId, contentOk });
    } catch (err) {
      streamDebugLog("background", "inject_content_failed", {
        tabId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  if (intercept?.fetchPatched) {
    streamDebugLog("background", "tab_intercept_ready", {
      tabId,
      fetchPatched: intercept.fetchPatched,
      xhrPatched: intercept.xhrPatched,
      href: intercept.href
    });
  } else {
    streamDebugLog("background", "tab_intercept_missing", { tabId, url: tab.url });
  }

  return { intercept, contentOk };
}

export async function waitTabComplete(tabId: number, timeoutMs = 12_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") return;
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

export function clearReloadedTabMark(tabId: number): void {
  reloadedTabIds.delete(tabId);
}
