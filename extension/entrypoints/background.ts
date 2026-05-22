import { buildGeminiUrl, createAccountId, getBackendConfig, getTabs, removeAccountTab, setAccountTab, setBackendConfig } from "../src/lib/storage";
import type { ExtensionMessage, ExtensionMessageResponse } from "../src/lib/messages";
import type { Account, BackendConnectionConfig, BackendConnectionStatus, BusyState, DashboardSummary, ExtensionState, HistoryMessage } from "../src/lib/types";

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
  private config: BackendConnectionConfig = { host: "127.0.0.1", port: 8787 };
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;
  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: number }>();
  private status: BackendConnectionStatus = {
    host: "127.0.0.1",
    port: 8787,
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
const CHAT_RELOAD_THRESHOLD = 5;
const accountChatCounts = new Map<string, number>();

function withPageIdNone(pageRoot: string): string {
  try {
    const url = new URL(pageRoot);
    url.searchParams.set("pageId", "none");
    return url.toString();
  } catch {
    const sep = pageRoot.includes("?") ? "&" : "?";
    return `${pageRoot}${sep}pageId=none`;
  }
}

async function reloadAccountToRoot(accountId: string): Promise<void> {
  const tabs = await getTabs();
  const mapped = tabs.find((item) => item.accountId === accountId);
  if (!mapped) return;
  const state = await getStateFromBackend().catch(() => null);
  const account = state?.accounts.find((item) => item.id === accountId);
  const pageRoot = account?.pageRoot || mapped.url;
  if (!pageRoot) return;
  const targetUrl = withPageIdNone(pageRoot);
  try {
    await chrome.tabs.update(mapped.tabId, { url: targetUrl });
    await setAccountTab({
      accountId,
      tabId: mapped.tabId,
      windowId: mapped.windowId,
      url: targetUrl,
      updatedAt: new Date().toISOString()
    });
    await waitForTabReady(mapped.tabId);
  } catch {
    // tab may have been closed; ignore
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
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isClosedMessageChannelError(error)) throw error;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/content.js"]
    });
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
    const next = (accountChatCounts.get(payload.accountId) || 0) + 1;
    if (next >= CHAT_RELOAD_THRESHOLD) {
      accountChatCounts.set(payload.accountId, 0);
      // fire-and-forget reload so caller still gets the current response immediately
      reloadAccountToRoot(payload.accountId).catch(() => {});
    } else {
      accountChatCounts.set(payload.accountId, next);
    }
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
  if (action !== "send_prompt") {
    throw new Error(`Unsupported controller action: ${action}`);
  }
  const accountId = String(payload?.account_id || "");
  const model = String(payload?.model || "google/gemini-flash");
  const prompt = String(payload?.prompt || "");
  if (!accountId || !prompt.trim()) {
    throw new Error("Missing account_id or prompt");
  }
  const result = await sendPrompt({ accountId, model, prompt });
  return {
    account_id: result.accountId,
    model: result.model,
    response_text: result.responseText
  };
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
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === "string") acc += piece;
        } catch {
          // skip malformed chunk
        }
      }
    }
    if (!acc.trim()) throw new Error("Streamed response content is empty");
    return { accountId: payload.accountId, model: payload.model, responseText: acc };
  }
  const data = await response.json().catch(() => ({}));
  const responseText = String(data?.choices?.[0]?.message?.content || "");
  if (!responseText.trim()) {
    throw new Error("OpenAI response content is empty");
  }
  return { accountId: payload.accountId, model: payload.model, responseText };
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionMessageResponse> {
  switch (message.type) {
    case "state.get":
      return { ok: true, state: await composeState() };
    case "dashboard.get": {
      let dashboard: DashboardSummary = {
        accountCount: 0,
        enabledAccountCount: 0,
        openGeminiTabCount: 0,
        historyCount: 0,
        busyCount: 0
      };
      try {
        dashboard = await backend.request<DashboardSummary>("dashboard.get");
      } catch {
        // keep default dashboard when backend is unavailable
      }
      const tabs = await getTabs();
      return {
        ok: true,
        dashboard: {
          accountCount: dashboard.accountCount ?? 0,
          enabledAccountCount: dashboard.enabledAccountCount ?? 0,
          openGeminiTabCount: tabs.length,
          historyCount: dashboard.historyCount ?? 0,
          busyCount: dashboard.busyCount ?? 0
        }
      };
    }
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
      accountChatCounts.delete(message.payload.accountId);
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

export default defineBackground(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      // Ignore if unsupported in current browser build.
    });
  }

  backend.init().catch(() => {
    // keep retry loop managed by the client
  });

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

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
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
