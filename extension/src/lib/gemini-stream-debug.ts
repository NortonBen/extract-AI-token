/**
 * Stream intercept debug.
 *
 * Bật trên tab Gemini:
 *   localStorage.setItem('extract-token-stream-debug', '1'); location.reload()
 *
 * Xem log tại console Extension (service worker):
 *   chrome://extensions → Extract Token → "service worker" / Inspect views
 *
 * Trên tab Gemini (tuỳ chọn): __extractTokenStreamDebug.dump()
 */

export const STREAM_DEBUG_STORAGE_KEY = "extract-token-stream-debug";
export const STREAM_CONTROL_EVENT = "extract-token-stream-control";
/** Message tới background — hiện trên console Extension. */
export const STREAM_DEBUG_MESSAGE_TYPE = "extract-token.stream.debug";

export type StreamDebugLayer = "intercept" | "content" | "background";

export interface StreamDebugEntry {
  ts: number;
  layer: StreamDebugLayer;
  event: string;
  detail?: Record<string, unknown>;
}

const buffer: StreamDebugEntry[] = [];
const MAX_ENTRIES = 400;
let debugOverride: boolean | null = null;

export type StreamDebugBackendContext = {
  tabId?: number;
  accountId?: string;
  url?: string;
};

let backendRelay: ((entry: StreamDebugEntry, ctx?: StreamDebugBackendContext) => void) | null =
  null;

/** Gọi từ background.ts — gửi log lên backend WS (`debug_push`). */
export function setStreamDebugBackendRelay(
  fn: (entry: StreamDebugEntry, ctx?: StreamDebugBackendContext) => void
): void {
  backendRelay = fn;
}

/** Luôn đẩy lên backend khi lỗi tab/intercept (kể cả khi debug tắt). */
export function shouldRelayTabDebugToBackend(event: string): boolean {
  if (isStreamDebugEnabled()) return true;
  return /missing|failed|error|warn|reload/i.test(event);
}

/** Service worker: set after reading chrome.storage.local */
export function setStreamDebugOverride(enabled: boolean): void {
  debugOverride = enabled;
}

export function isStreamDebugEnabled(): boolean {
  if (debugOverride === true) return true;
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(STREAM_DEBUG_STORAGE_KEY) === "1") {
      return true;
    }
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(STREAM_DEBUG_STORAGE_KEY) === "1") {
      return true;
    }
    if (typeof location !== "undefined" && location.search) {
      return new URLSearchParams(location.search).has("extract_token_debug_stream");
    }
  } catch {
    // ignore
  }
  return false;
}

/** In service worker console (chrome://extensions → Inspect service worker). */
export function printStreamDebugToExtensionConsole(entry: StreamDebugEntry): void {
  const time = new Date(entry.ts).toISOString().slice(11, 23);
  const tag = `[ExtractToken:${entry.layer}]`;
  if (entry.detail !== undefined) {
    console.log(`${time} ${tag}`, entry.event, entry.detail);
  } else {
    console.log(`${time} ${tag}`, entry.event);
  }
}

function relayStreamDebugToExtension(entry: StreamDebugEntry): void {
  try {
    const rt = typeof chrome !== "undefined" ? chrome.runtime : undefined;
    if (!rt?.sendMessage) return;
    void rt.sendMessage({ type: STREAM_DEBUG_MESSAGE_TYPE, entry }).catch(() => {
      // service worker asleep or no listener
    });
  } catch {
    // ignore
  }
}

export function streamDebugLog(
  layer: StreamDebugLayer,
  event: string,
  detail?: Record<string, unknown>
): void {
  if (!isStreamDebugEnabled()) return;
  const entry: StreamDebugEntry = {
    ts: Date.now(),
    layer,
    event,
    detail: detail ? { ...detail } : undefined
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  if (layer === "background") {
    printStreamDebugToExtensionConsole(entry);
    if (backendRelay && shouldRelayTabDebugToBackend(event)) {
      backendRelay(entry);
    }
  } else {
    relayStreamDebugToExtension(entry);
    const tag = `[ExtractToken:${layer}]`;
    if (detail !== undefined) {
      console.log(tag, event, detail);
    } else {
      console.log(tag, event);
    }
  }
}

export function getStreamDebugLog(): StreamDebugEntry[] {
  return buffer.slice();
}

function persistDebugFlag(enabled: boolean): void {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      if (enabled) {
        void chrome.storage.local.set({ [STREAM_DEBUG_STORAGE_KEY]: "1" });
      } else {
        void chrome.storage.local.remove(STREAM_DEBUG_STORAGE_KEY);
      }
    }
  } catch {
    // ignore
  }
}

export function installStreamDebugGlobal(layer: StreamDebugLayer): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    __extractTokenStreamDebug?: {
      layer: StreamDebugLayer;
      enable: () => void;
      disable: () => void;
      isEnabled: () => boolean;
      getLog: () => StreamDebugEntry[];
      dump: () => void;
      help: () => void;
    };
  };
  w.__extractTokenStreamDebug = {
    layer,
    enable: () => {
      try {
        localStorage.setItem(STREAM_DEBUG_STORAGE_KEY, "1");
      } catch {
        // ignore
      }
      persistDebugFlag(true);
      setStreamDebugOverride(true);
      console.info(
        "[ExtractToken] stream debug ON — reload tab Gemini; xem console Extension (service worker)"
      );
    },
    disable: () => {
      try {
        localStorage.removeItem(STREAM_DEBUG_STORAGE_KEY);
      } catch {
        // ignore
      }
      persistDebugFlag(false);
      setStreamDebugOverride(false);
      console.info("[ExtractToken] stream debug OFF");
    },
    isEnabled: isStreamDebugEnabled,
    getLog: getStreamDebugLog,
    dump: () => {
      console.table(getStreamDebugLog());
    },
    help: () => {
      console.info(`
Extract Token — stream debug (${layer})
  Bật:  localStorage.setItem('extract-token-stream-debug','1'); location.reload()
  Log Extension: chrome://extensions → Extract Token → service worker → Inspect
  Tab:    __extractTokenStreamDebug.dump()
      `.trim());
    }
  };
}

export function truncateUrl(url: string, max = 120): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max)}…`;
}

/** MAIN world không có chrome.runtime — relay debug qua isolated content. */
export function emitInterceptDebug(event: string, detail?: Record<string, unknown>): void {
  try {
    window.postMessage(
      {
        __geminiStreamDebugRelay: true,
        layer: "intercept",
        event,
        detail,
        ts: Date.now()
      },
      "*"
    );
  } catch {
    // ignore
  }
}
