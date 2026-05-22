import { buildGeminiUrl, createAccountId, getBackendConfig, getTabs, removeAccountTab, setAccountTab, setBackendConfig } from "../src/lib/storage";
import type { ExtensionMessage, ExtensionMessageResponse } from "../src/lib/messages";
import {
  isStreamDebugEnabled,
  printStreamDebugToExtensionConsole,
  setStreamDebugBackendRelay,
  setStreamDebugOverride,
  shouldRelayTabDebugToBackend,
  STREAM_DEBUG_MESSAGE_TYPE,
  STREAM_DEBUG_STORAGE_KEY,
  streamDebugLog,
  type StreamDebugEntry
} from "../src/lib/gemini-stream-debug";
import { ensureGeminiTabScripts } from "../src/lib/gemini-tab-scripts";
import type {
  Account,
  BackendConnectionConfig,
  BackendConnectionStatus,
  BusyState,
  DashboardSummary,
  ExtensionState,
  HistoryMessage,
  UsageStats
} from "../src/lib/types";

async function recordChatUsage(prompt: string, output: string): Promise<void> {
  try {
    await backend.request("usage.record", {
      prompt: prompt || "",
      output: output || ""
    });
  } catch {
    // backend may be offline
  }
}

function mapUsageStats(raw: Record<string, unknown>): UsageStats {
  return {
    historyStoredCount: Number(raw.history_stored_count ?? 0),
    historySavedTotal: Number(raw.history_saved_total ?? 0),
    promptTokens: Number(raw.prompt_tokens ?? 0),
    completionTokens: Number(raw.completion_tokens ?? 0),
    totalTokens: Number(raw.total_tokens ?? 0)
  };
}

function mapDashboard(raw: Record<string, unknown>): DashboardSummary {
  return {
    accountCount: Number(raw.account_count ?? 0),
    enabledAccountCount: Number(raw.enabled_account_count ?? 0),
    openGeminiTabCount: 0,
    historyCount: Number(raw.history_count ?? 0),
    busyCount: Number(raw.busy_count ?? 0),
    promptTokens: Number(raw.prompt_tokens ?? 0),
    completionTokens: Number(raw.completion_tokens ?? 0),
    totalTokens: Number(raw.total_tokens ?? 0),
    historySavedTotal: Number(raw.history_saved_total ?? 0)
  };
}

type WsPayload = Record<string, unknown>;

interface WsRequestEnvelope {
  id: string;
  type: string;
  payload?: WsPayload;
}

interface WsResponseEnvelope {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

interface WsIncomingRequestEnvelope {
  id: string;
  type: string;
  payload?: WsPayload;
}

class BackendWsClient {
  private ws: WebSocket | null = null;
  private config: BackendConnectionConfig = { host: "127.0.0.1", port: 9516 };
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;
  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: number }>();
  private status: BackendConnectionStatus = {
    host: "127.0.0.1",
    port: 9516,
    connected: false,
    lastError: null
  };

  async init(): Promise<void> {
    this.config = await getBackendConfig();
    this.status = { ...this.config, connected: false, lastError: null };
    this.connect();
  }

  getStatus(): BackendConnectionStatus {
    return { ...this.status };
  }

  async updateConfig(config: BackendConnectionConfig): Promise<BackendConnectionStatus> {
    this.config = await setBackendConfig(config);
    this.status = { ...this.config, connected: false, lastError: null };
    this.reconnectNow();
    return this.getStatus();
  }

  reconnectNow(): void {
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connect();
  }

  async request<T = unknown>(type: string, payload: WsPayload = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Backend websocket is not connected");
    }
    const id = crypto.randomUUID();
    const envelope: WsRequestEnvelope = { id, type, payload };
    const text = JSON.stringify(envelope);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`WS request timeout: ${type}`));
      }, 15000) as unknown as number;
      this.pending.set(id, { resolve: (data) => resolve(data as T), reject, timer });
      this.ws!.send(text);
    });
  }

  async respond(id: string, ok: boolean, data?: unknown, error?: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        id,
        ok,
        data: data ?? null,
        error: error ?? null
      })
    );
  }

  /** Push live Gemini stream frames to backend (no RPC id — see stream_push in http.rs). */
  pushStream(
    streamId: string,
    payload: { event: "delta" | "done" | "error"; delta?: string; text?: string; error?: string }
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      streamDebugLog("background", "stream_push_skip", {
        streamId,
        event: payload.event,
        wsOpen: this.ws?.readyState === WebSocket.OPEN
      });
      return;
    }
    if (payload.event === "delta") {
      streamDebugLog("background", "stream_push_delta", {
        streamId,
        deltaLen: payload.delta?.length ?? 0
      });
    } else {
      streamDebugLog("background", "stream_push", {
        streamId,
        event: payload.event,
        textLen: payload.text?.length ?? 0,
        error: payload.error
      });
    }
    this.ws.send(
      JSON.stringify({
        stream_push: true,
        stream_id: streamId,
        ...payload
      })
    );
  }

  /** Tab/stream debug → backend terminal + GET /v1/debug/tab */
  pushTabDebug(payload: {
    ts: number;
    layer: string;
    event: string;
    tabId?: number;
    accountId?: string;
    url?: string;
    detail?: Record<string, unknown>;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        debug_push: true,
        ts: payload.ts,
        layer: payload.layer,
        event: payload.event,
        tab_id: payload.tabId ?? null,
        account_id: payload.accountId ?? null,
        url: payload.url ?? null,
        detail: payload.detail ?? null
      })
    );
  }

  private wsUrl(): string {
    return `ws://${this.config.host}:${this.config.port}/ws`;
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.wsUrl());
    } catch (err) {
      this.setDisconnected(err instanceof Error ? err.message : "Cannot create websocket");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.status.connected = true;
      this.status.lastError = null;
    };

    this.ws.onmessage = async (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof msg?.type === "string" && typeof msg?.id === "string") {
        const req = msg as WsIncomingRequestEnvelope;
        try {
          const data = await handleBackendControllerRequest(req.type, req.payload || {});
          await this.respond(req.id, true, data);
        } catch (error) {
          await this.respond(
            req.id,
            false,
            null,
            error instanceof Error ? error.message : "controller request failed"
          );
        }
        return;
      }
      const response = msg as WsResponseEnvelope;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.data);
      else pending.reject(new Error(response.error || "Backend error"));
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.setDisconnected("Connection closed");
      this.rejectAllPending("Connection closed");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setDisconnected("Websocket error");
    };
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  private setDisconnected(lastError: string): void {
    this.status.connected = false;
    this.status.lastError = lastError;
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500) as unknown as number;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

const backend = new BackendWsClient();
const MANAGED_GROUP_TITLE = "Extract Token";

/**
 * Reset the mapped Gemini tab for the next prompt without closing it.
 * Content script clicks "Cuộc trò chuyện mới" (SPA) instead of reloading the page.
 */
async function prepareAccountTabForNextChat(accountId: string): Promise<void> {
  const tabs = await getTabs();
  const mapped = tabs.find((item) => item.accountId === accountId);
  if (!mapped) return;

  try {
    await sendMessageToGeminiTab(mapped.tabId, { type: "gemini.chat.prepare" });
    const updated = await chrome.tabs.get(mapped.tabId);
    await setAccountTab({
      accountId,
      tabId: mapped.tabId,
      windowId: updated.windowId ?? mapped.windowId,
      url: updated.url || mapped.url,
      updatedAt: new Date().toISOString()
    });
  } catch {
    await removeAccountTab(accountId).catch(() => {});
  }
}

function isClosedMessageChannelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("The message port closed before a response was received") ||
    message.includes("message channel closed before a response was received")
  );
}

async function ensureManagedTabGroup(tabId: number, windowId?: number): Promise<void> {
  if (!chrome.tabs.group || !chrome.tabGroups?.update) return;
  try {
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, {
      title: MANAGED_GROUP_TITLE,
      color: "blue",
      collapsed: false
    });
    return;
  } catch {
    // fallback: try to re-use an existing group in current window
  }

  if (windowId === undefined || !chrome.tabGroups?.query) return;
  try {
    const groups = await chrome.tabGroups.query({ windowId, title: MANAGED_GROUP_TITLE });
    const targetGroup = groups[0];
    if (!targetGroup || targetGroup.id === undefined) return;
    await chrome.tabs.group({ groupId: targetGroup.id, tabIds: [tabId] });
  } catch {
    // keep tab usable even if grouping fails
  }
}

function normalizeGeminiRootFromUrl(rawUrl: string): { pageRoot: string; userIndex: number | null } {
  const url = new URL(rawUrl);
  if (url.hostname !== "gemini.google.com") {
    throw new Error("Active tab is not Gemini");
  }
  const m = url.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
  if (m) {
    const userIndex = Number(m[1]);
    return { pageRoot: `${url.origin}/u/${userIndex}/app`, userIndex };
  }
  return { pageRoot: `${url.origin}/app`, userIndex: null };
}

interface GeminiAccountPreview {
  pageRoot: string;
  userIndex: number | null;
  displayName: string;
  email: string;
  avatarUrl: string;
  tier: string;
}

async function detectGeminiRootFromActiveTab(): Promise<GeminiAccountPreview> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab?.id;
  const tabUrl = tab?.url;
  if (!tabId) throw new Error("Cannot read active tab ID");
  if (!tabUrl) throw new Error("Cannot read active tab URL");
  const normalized = normalizeGeminiRootFromUrl(tabUrl);
  const response = await sendMessageToGeminiTab(tabId, { type: "gemini.account.detect" });
  if (!response?.ok || !response?.preview) {
    throw new Error(response?.error || "Cannot detect Gemini account info from active tab");
  }
  return {
    ...response.preview,
    pageRoot: normalized.pageRoot,
    userIndex: normalized.userIndex
  };
}

async function sendMessageToGeminiTab(tabId: number, message: any): Promise<any> {
  await ensureGeminiTabScripts(tabId);
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isClosedMessageChannelError(error)) throw error;
    await ensureGeminiTabScripts(tabId, { allowReload: true });
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

function mapBackendAccount(raw: any): Account {
  const normalizedUserIndex =
    typeof raw?.user_index === "number" && raw.user_index >= 0 ? raw.user_index : null;
  const normalizedPageRoot =
    typeof raw?.page_root === "string" && raw.page_root
      ? raw.page_root
      : buildGeminiUrl(normalizedUserIndex ?? 0);
  return {
    id: String(raw?.id || ""),
    provider: raw?.provider === "chatgpt" ? "chatgpt" : "gemini",
    userIndex: normalizedUserIndex,
    pageRoot: normalizedPageRoot,
    label: String(raw?.label || ""),
    enabled: Boolean(raw?.enabled),
    defaultModel: String(raw?.default_model || "gemini-flash"),
    createdAt: String(raw?.created_at || new Date().toISOString()),
    updatedAt: String(raw?.updated_at || new Date().toISOString())
  };
}

async function ensureGeminiTab(accountId: string): Promise<number> {
  return ensureGeminiTabWithOptions(accountId, { activate: true });
}

async function ensureGeminiTabWithOptions(accountId: string, options: { activate: boolean }): Promise<number> {
  const state = await getStateFromBackend();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);
  const url = account.pageRoot || buildGeminiUrl(account.userIndex ?? 0);

  const tabs = await getTabs();
  const mapped = tabs.find((item) => item.accountId === accountId);
  if (mapped) {
    try {
      const existing = await chrome.tabs.get(mapped.tabId);
      if (existing.id) {
        await chrome.tabs.update(existing.id, { active: options.activate });
        await ensureManagedTabGroup(existing.id, existing.windowId);
        await setAccountTab({
          accountId,
          tabId: existing.id,
          windowId: existing.windowId,
          url: existing.url || url,
          updatedAt: new Date().toISOString()
        });
        await waitForTabReady(existing.id);
        await ensureGeminiTabScripts(existing.id);
        return existing.id;
      }
    } catch {
      await removeAccountTab(accountId);
    }
  }

  const openGeminiTabs = await chrome.tabs.query({ url: ["https://gemini.google.com/*"] });
  const reusable = openGeminiTabs.find((tab) => {
    const tabUrl = tab.url || "";
    if (!tabUrl) return false;
    if (tabUrl.startsWith(url)) return true;
    if (account.userIndex === null) {
      return /^https:\/\/gemini\.google\.com\/app(?:[/?#]|$)/.test(tabUrl);
    }
    return tabUrl.includes(`/u/${account.userIndex}/`);
  });
  if (reusable?.id) {
    await chrome.tabs.update(reusable.id, { active: options.activate });
    await ensureManagedTabGroup(reusable.id, reusable.windowId);
    await setAccountTab({
      accountId,
      tabId: reusable.id,
      windowId: reusable.windowId,
      url: reusable.url || url,
      updatedAt: new Date().toISOString()
    });
    await waitForTabReady(reusable.id);
    await ensureGeminiTabScripts(reusable.id);
    return reusable.id;
  }

  const tab = await chrome.tabs.create({ url, active: options.activate });
  if (!tab.id) throw new Error("Cannot create Gemini tab");
  await ensureManagedTabGroup(tab.id, tab.windowId);
  await setAccountTab({
    accountId,
    tabId: tab.id,
    windowId: tab.windowId,
    url,
    updatedAt: new Date().toISOString()
  });
  await waitForTabReady(tab.id, 20_000);
  await ensureGeminiTabScripts(tab.id);
  return tab.id;
}

async function waitForTabReady(tabId: number, timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === "complete") return;
    } catch {
      // keep polling within timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function pingGeminiTab(tabId: number, timeoutMs = 2500): Promise<boolean> {
  try {
    const result = await Promise.race([
      sendMessageToGeminiTab(tabId, {
        type: "gemini.command.execute",
        payload: { command: "ping" }
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
    return Boolean(result && (result as any).ok);
  } catch {
    return false;
  }
}

async function recreateAccountTab(accountId: string): Promise<number> {
  const tabs = await getTabs();
  const mapped = tabs.find((item) => item.accountId === accountId);
  if (mapped) {
    try {
      await chrome.tabs.remove(mapped.tabId);
    } catch {
      // tab may already be gone
    }
    await removeAccountTab(accountId);
  }
  return ensureGeminiTabWithOptions(accountId, { activate: false });
}

async function ensureResponsiveAccountTab(accountId: string): Promise<number> {
  let tabId = await ensureGeminiTabWithOptions(accountId, { activate: false });
  await waitForTabReady(tabId);
  const scripts = await ensureGeminiTabScripts(tabId);
  if (!scripts.intercept?.fetchPatched) {
    streamDebugLog("background", "warn_no_intercept_before_send", { tabId });
  }
  if (await pingGeminiTab(tabId, 2500)) return tabId;

  // First attempt unresponsive — recycle the tab once.
  tabId = await recreateAccountTab(accountId);
  await waitForTabReady(tabId, 15000);
  if (await pingGeminiTab(tabId, 4000)) return tabId;
  throw new Error("Gemini tab is unresponsive (ping failed after recreate)");
}

/**
 * Race a promise against a deadline. Used to bail out when the Gemini tab is
 * stuck (e.g. prompt sat in composer with no submission, or response never
 * arrives). On timeout the caller is expected to recycle the tab.
 */
function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} deadline exceeded (${ms}ms)`)),
      ms
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

async function getStateFromBackend(): Promise<Pick<ExtensionState, "accounts" | "history" | "busy">> {
  const data = await backend.request<{
    accounts: any[];
    history: any[];
    busy: BusyState;
  }>("state.get");
  return {
    accounts: (data.accounts || []).map(mapBackendAccount),
    history: (data.history || []).map((item) => ({
      id: String(item?.id || ""),
      accountId: String(item?.account_id || ""),
      model: String(item?.model || ""),
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || ""),
      createdAt: String(item?.created_at || new Date().toISOString())
    })) as HistoryMessage[],
    busy: data.busy || { globalBusy: false, accounts: {} }
  };
}

async function composeState(): Promise<ExtensionState> {
  let backendState: Pick<ExtensionState, "accounts" | "history" | "busy"> = {
    accounts: [],
    history: [],
    busy: { globalBusy: false, accounts: {} }
  };
  try {
    backendState = await getStateFromBackend();
  } catch {
    // Keep panel usable when backend is down/unreachable.
  }
  const tabs = await getTabs();
  return {
    accounts: backendState.accounts,
    history: backendState.history,
    busy: backendState.busy,
    tabs,
    backend: backend.getStatus(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const SEND_HARD_DEADLINE_MS = 90_000;

async function performSend(tabId: number, prompt: string): Promise<any> {
  return withDeadline(
    sendMessageToGeminiTab(tabId, {
      type: "gemini.chat.send",
      payload: { prompt }
    }),
    SEND_HARD_DEADLINE_MS,
    "gemini.chat.send"
  );
}

async function performSendStream(
  tabId: number,
  prompt: string,
  streamId: string
): Promise<any> {
  return withDeadline(
    sendMessageToGeminiTab(tabId, {
      type: "gemini.chat.send_stream",
      payload: { prompt, streamId }
    }),
    SEND_HARD_DEADLINE_MS,
    "gemini.chat.send_stream"
  );
}

async function sendPromptStream(payload: {
  accountId: string;
  model: string;
  prompt: string;
  streamId: string;
}) {
  let tabId = await ensureResponsiveAccountTab(payload.accountId);
  await backend.request("busy.set", { account_id: payload.accountId, busy: true });
  try {
    let result: any;
    try {
      result = await performSendStream(tabId, payload.prompt, payload.streamId);
    } catch (firstErr) {
      try {
        await sendMessageToGeminiTab(tabId, { type: "gemini.chat.stop" });
      } catch {
        // best effort
      }
      tabId = await recreateAccountTab(payload.accountId);
      await waitForTabReady(tabId, 15000);
      result = await performSendStream(tabId, payload.prompt, payload.streamId);
    }
    if (result?.error) {
      backend.pushStream(payload.streamId, { event: "error", error: String(result.error) });
      throw new Error(String(result.error));
    }
    const responseText = typeof result?.responseText === "string" ? result.responseText : "";

    await backend.request("history.append", {
      id: crypto.randomUUID(),
      account_id: payload.accountId,
      model: payload.model,
      role: "user",
      content: payload.prompt
    });
    await backend.request("history.append", {
      id: crypto.randomUUID(),
      account_id: payload.accountId,
      model: payload.model,
      role: "assistant",
      content: responseText
    });
    await recordChatUsage(payload.prompt, responseText);
    prepareAccountTabForNextChat(payload.accountId).catch(() => {});
    return { accountId: payload.accountId, model: payload.model, responseText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    backend.pushStream(payload.streamId, { event: "error", error: msg });
    throw err;
  } finally {
    await backend.request("busy.set", { account_id: payload.accountId, busy: false });
  }
}

async function sendPrompt(payload: { accountId: string; model: string; prompt: string }) {
  let tabId = await ensureResponsiveAccountTab(payload.accountId);
  await backend.request("busy.set", { account_id: payload.accountId, busy: true });
  try {
    let result: any;
    try {
      result = await performSend(tabId, payload.prompt);
    } catch (firstErr) {
      // Tab is stuck (deadline) OR channel closed OR content threw — recycle
      // the tab and retry once with a fresh page so we don't sit on a hung
      // composer. We do NOT activate the tab automatically.
      try {
        await sendMessageToGeminiTab(tabId, { type: "gemini.chat.stop" });
      } catch {
        // best effort
      }
      tabId = await recreateAccountTab(payload.accountId);
      await waitForTabReady(tabId, 15000);
      result = await performSend(tabId, payload.prompt);
    }
    if (result?.error) {
      throw new Error(String(result.error));
    }
    const responseText = typeof result?.responseText === "string" ? result.responseText : "";

    await backend.request("history.append", {
      id: crypto.randomUUID(),
      account_id: payload.accountId,
      model: payload.model,
      role: "user",
      content: payload.prompt
    });
    await backend.request("history.append", {
      id: crypto.randomUUID(),
      account_id: payload.accountId,
      model: payload.model,
      role: "assistant",
      content: responseText
    });
    await recordChatUsage(payload.prompt, responseText);
    prepareAccountTabForNextChat(payload.accountId).catch(() => {});
    return { accountId: payload.accountId, model: payload.model, responseText };
  } finally {
    await backend.request("busy.set", { account_id: payload.accountId, busy: false });
  }
}

async function stopPromptForAccount(accountId: string): Promise<void> {
  const tabs = await getTabs();
  const mapped = tabs.find((item) => item.accountId === accountId);
  if (!mapped) return;
  try {
    await sendMessageToGeminiTab(mapped.tabId, { type: "gemini.chat.stop" });
  } catch {
    // tab missing — best effort
  }
  await backend.request("busy.set", { account_id: accountId, busy: false }).catch(() => {});
}

async function setAccountEnabled(accountId: string, enabled: boolean): Promise<void> {
  const state = await getStateFromBackend();
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);
  await backend.request("account.upsert", {
    id: account.id,
    provider: account.provider,
    user_index: account.userIndex,
    page_root: account.pageRoot,
    label: account.label,
    enabled,
    default_model: account.defaultModel
  });
}

async function handleBackendControllerRequest(type: string, payload: WsPayload): Promise<unknown> {
  if (type !== "controller.execute") {
    throw new Error(`Unsupported controller type: ${type}`);
  }
  const action = String(payload?.action || "");
  const accountId = String(payload?.account_id || "");
  const model = String(payload?.model || "google/gemini-flash");
  const prompt = String(payload?.prompt || "");
  if (!accountId || !prompt.trim()) {
    throw new Error("Missing account_id or prompt");
  }

  if (action === "send_prompt_stream") {
    const streamId = String(payload?.stream_id || "");
    if (!streamId) throw new Error("Missing stream_id");
    void sendPromptStream({ accountId, model, prompt, streamId });
    return { accepted: true, stream_id: streamId };
  }

  if (action !== "send_prompt") {
    throw new Error(`Unsupported controller action: ${action}`);
  }
  const result = await sendPrompt({ accountId, model, prompt });
  const out: Record<string, string> = {
    account_id: result.accountId,
    model: result.model,
    response_text: result.responseText
  };
  if (typeof result.responseHtml === "string" && result.responseHtml.trim()) {
    out.response_html = result.responseHtml;
  }
  return out;
}

async function sendPromptViaOpenAiApi(payload: {
  accountId: string;
  model: string;
  prompt: string;
  stream?: boolean;
}) {
  const cfg = backend.getStatus();
  const wantStream = Boolean(payload.stream);
  const response = await fetch(`http://${cfg.host}:${cfg.port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: payload.model,
      stream: wantStream,
      account_id: payload.accountId,
      messages: [{ role: "user", content: payload.prompt }]
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(String(data?.error || response.statusText));
  }
  if (wantStream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let acc = "";
    let sawToolCalls = false;
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
        try {
          const obj = JSON.parse(data);
          const choice = obj?.choices?.[0];
          const piece = choice?.delta?.content;
          if (typeof piece === "string") acc += piece;
          const toolDelta = choice?.delta?.tool_calls;
          if (Array.isArray(toolDelta) && toolDelta.length > 0) sawToolCalls = true;
          if (choice?.finish_reason === "tool_calls") sawToolCalls = true;
        } catch {
          // skip malformed chunk
        }
      }
    }
    if (!acc.trim() && !sawToolCalls) throw new Error("Streamed response content is empty");
    return { accountId: payload.accountId, model: payload.model, responseText: acc };
  }
  const data = await response.json().catch(() => ({}));
  const choice = data?.choices?.[0];
  const toolCalls = choice?.message?.tool_calls;
  const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;
  const responseText = String(choice?.message?.content || "");
  if (!responseText.trim() && !hasToolCalls) {
    throw new Error("OpenAI response content is empty");
  }
  if (hasToolCalls) {
    return {
      accountId: payload.accountId,
      model: payload.model,
      responseText: JSON.stringify(toolCalls)
    };
  }
  return { accountId: payload.accountId, model: payload.model, responseText };
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionMessageResponse> {
  switch (message.type) {
    case "state.get":
      return { ok: true, state: await composeState() };
    case "dashboard.get": {
      let dashboard: DashboardSummary = mapDashboard({});
      try {
        const raw = await backend.request<Record<string, unknown>>("dashboard.get");
        dashboard = mapDashboard(raw);
      } catch {
        // keep default dashboard when backend is unavailable
      }
      const tabs = await getTabs();
      return {
        ok: true,
        dashboard: { ...dashboard, openGeminiTabCount: tabs.length }
      };
    }
    case "usage.get": {
      const raw = await backend.request<Record<string, unknown>>("usage.get");
      return { ok: true, usage: mapUsageStats(raw) };
    }
    case "usage.reset":
      await backend.request("usage.reset");
      return { ok: true };
    case "backend.status.get":
      return { ok: true, backend: backend.getStatus() };
    case "backend.config.set": {
      const next = await backend.updateConfig(message.payload);
      return { ok: true, backend: next };
    }
    case "backend.reconnect":
      backend.reconnectNow();
      return { ok: true, backend: backend.getStatus() };
    case "history.clear":
      await backend.request("history.clear");
      return { ok: true };
    case "account.delete":
      await backend.request("account.delete", { account_id: message.payload.accountId });
      await removeAccountTab(message.payload.accountId);
      return { ok: true };
    case "account.detect-root": {
      const preview = await detectGeminiRootFromActiveTab();
      return { ok: true, preview };
    }
    case "account.upsert":
      await backend.request("account.upsert", {
        id: message.payload.id || createAccountId(message.payload.provider, message.payload.userIndex ?? 0),
        provider: message.payload.provider,
        user_index: message.payload.userIndex,
        page_root: message.payload.pageRoot,
        label: message.payload.label,
        enabled: message.payload.enabled,
        default_model: message.payload.defaultModel
      });
      return { ok: true, state: await composeState() };
    case "tab.ensure": {
      const tabId = await ensureGeminiTab(message.payload.accountId);
      return { ok: true, tabId };
    }
    case "tab.command.execute": {
      const tabId = await ensureResponsiveAccountTab(message.payload.accountId);
      const exec = await sendMessageToGeminiTab(tabId, {
        type: "gemini.command.execute",
        payload: {
          command: message.payload.command,
          prompt: message.payload.prompt
        }
      });
      if (!exec?.ok) {
        throw new Error(exec?.error || "Command execution failed");
      }
      return { ok: true, exec };
    }
    case "chat.send": {
      const result = await sendPrompt(message.payload);
      return { ok: true, result };
    }
    case "openai.chat.send": {
      const result = await sendPromptViaOpenAiApi(message.payload);
      return { ok: true, result };
    }
    case "chat.stop": {
      await stopPromptForAccount(message.payload.accountId);
      return { ok: true };
    }
    case "account.set-enabled": {
      await setAccountEnabled(message.payload.accountId, message.payload.enabled);
      return { ok: true, state: await composeState() };
    }
    default:
      return { ok: false, error: "Unsupported message type" };
  }
}

const backgroundDebugBuffer: StreamDebugEntry[] = [];
const BACKGROUND_DEBUG_MAX = 400;

function refreshStreamDebugFlag(): void {
  try {
    if (!chrome.storage?.local) {
      setStreamDebugOverride(false);
      return;
    }
    chrome.storage.local.get(STREAM_DEBUG_STORAGE_KEY, (stored) => {
      if (chrome.runtime.lastError) {
        setStreamDebugOverride(false);
        return;
      }
      const on = stored?.[STREAM_DEBUG_STORAGE_KEY] === "1";
      setStreamDebugOverride(on);
      if (on) {
        console.info(
          "[ExtractToken:background] stream debug ON — log intercept/content sẽ hiện ở console Extension này"
        );
      }
    });
  } catch {
    setStreamDebugOverride(false);
  }
}

async function resolveAccountIdForTab(tabId?: number): Promise<string | undefined> {
  if (tabId === undefined) return undefined;
  const tabs = await getTabs();
  return tabs.find((t) => t.tabId === tabId)?.accountId;
}

async function ingestStreamDebugFromTab(
  entry: StreamDebugEntry,
  sender?: chrome.runtime.MessageSender
): Promise<void> {
  const relayBackend = shouldRelayTabDebugToBackend(entry.event);
  if (!isStreamDebugEnabled() && !relayBackend) return;

  backgroundDebugBuffer.push(entry);
  if (backgroundDebugBuffer.length > BACKGROUND_DEBUG_MAX) backgroundDebugBuffer.shift();
  printStreamDebugToExtensionConsole(entry);

  if (!relayBackend) return;

  const tabId = sender?.tab?.id;
  let url: string | undefined;
  if (tabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(tabId);
      url = tab.url;
    } catch {
      // ignore
    }
  }
  const accountId = await resolveAccountIdForTab(tabId);
  backend.pushTabDebug({
    ts: entry.ts,
    layer: entry.layer,
    event: entry.event,
    tabId,
    accountId,
    url,
    detail: entry.detail
  });
}

export default defineBackground(() => {
  setStreamDebugBackendRelay((entry, ctx) => {
    if (!shouldRelayTabDebugToBackend(entry.event)) return;
    backend.pushTabDebug({
      ts: entry.ts,
      layer: entry.layer,
      event: entry.event,
      tabId: ctx?.tabId,
      accountId: ctx?.accountId,
      url: ctx?.url,
      detail: entry.detail
    });
  });

  refreshStreamDebugFlag();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && STREAM_DEBUG_STORAGE_KEY in changes) {
      refreshStreamDebugFlag();
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (!tab.url?.includes("gemini.google.com")) return;
    void ensureGeminiTabScripts(tabId, { allowReload: false }).catch(() => {});
  });

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      // Ignore if unsupported in current browser build.
    });
  }

  backend.init().catch(() => {
    // keep retry loop managed by the client
  });

  (globalThis as typeof globalThis & {
    __extractTokenStreamDebugBg?: {
      dump: () => void;
      getLog: () => StreamDebugEntry[];
      help: () => void;
    };
  }).__extractTokenStreamDebugBg = {
    dump: () => console.table(backgroundDebugBuffer),
    getLog: () => backgroundDebugBuffer.slice(),
    help: () => {
      console.info(`
[ExtractToken:background] stream debug
  Bật: tab Gemini → localStorage.setItem('extract-token-stream-debug','1'); reload
  __extractTokenStreamDebugBg.dump()
      `.trim());
    }
  };

  chrome.runtime.onInstalled.addListener(async () => {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
    try {
      const state = await getStateFromBackend();
      if (state.accounts.length === 0) {
        await backend.request("account.upsert", {
          id: createAccountId("gemini", 0),
          provider: "gemini",
          user_index: 0,
          page_root: buildGeminiUrl(0),
          label: "Gemini User 0",
          enabled: true,
          default_model: "gemini-flash"
        });
      }
    } catch {
      // backend may not be up yet
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const raw = message as ExtensionMessage & {
      type?: string;
      entry?: StreamDebugEntry;
      payload?: {
        streamId?: string;
        event?: "delta" | "done" | "error";
        delta?: string;
        text?: string;
        error?: string;
      };
    };

    if (raw?.type === STREAM_DEBUG_MESSAGE_TYPE && raw.entry) {
      void ingestStreamDebugFromTab(raw.entry, sender).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (raw?.type === "gemini.stream.push") {
      const streamId = String(raw.payload?.streamId || "");
      const event = raw.payload?.event;
      if (streamId && event) {
        backend.pushStream(streamId, {
          event,
          delta: raw.payload?.delta,
          text: raw.payload?.text,
          error: raw.payload?.error
        });
      }
      sendResponse({ ok: true });
      return true;
    }

    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      );
    return true;
  });

  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener(async (tab) => {
      if (!chrome.sidePanel?.open) return;
      if (tab.windowId === undefined) return;
      await chrome.sidePanel.open({ windowId: tab.windowId });
    });
  }
});
