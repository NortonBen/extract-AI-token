import type { ExtensionMessage, ExtensionMessageResponse } from "./messages";
import type {
  BackendConnectionConfig,
  BackendConnectionStatus,
  ChatResult,
  DashboardSummary,
  ExtensionState,
  GeminiExecutorCommand,
  GeminiExecutorResult,
  GeminiAccountPreview
} from "./types";

async function send(message: ExtensionMessage): Promise<ExtensionMessageResponse> {
  const response = await chrome.runtime.sendMessage(message);
  return response as ExtensionMessageResponse;
}

export async function getState(): Promise<ExtensionState> {
  const res = await send({ type: "state.get" });
  if (!res.ok || !("state" in res)) throw new Error((res as any).error || "state.get failed");
  return res.state;
}

export async function getDashboard(): Promise<DashboardSummary> {
  const res = await send({ type: "dashboard.get" });
  if (!res.ok || !("dashboard" in res)) throw new Error((res as any).error || "dashboard.get failed");
  return res.dashboard;
}

export async function upsertAccount(payload: {
  id: string;
  provider: "gemini" | "chatgpt";
  userIndex: number | null;
  pageRoot: string;
  label: string;
  enabled: boolean;
  defaultModel: string;
}): Promise<void> {
  const res = await send({ type: "account.upsert", payload });
  if (!res.ok) throw new Error(res.error);
}

export async function detectGeminiRootFromActiveTab(): Promise<GeminiAccountPreview> {
  const res = await send({ type: "account.detect-root" });
  if (!res.ok || !("preview" in res)) throw new Error((res as any).error || "account.detect-root failed");
  return res.preview;
}

export async function deleteAccount(accountId: string): Promise<void> {
  const res = await send({ type: "account.delete", payload: { accountId } });
  if (!res.ok) throw new Error(res.error);
}

export async function ensureTab(accountId: string): Promise<number> {
  const res = await send({ type: "tab.ensure", payload: { accountId } });
  if (!res.ok || !("tabId" in res)) throw new Error((res as any).error || "tab.ensure failed");
  return res.tabId;
}

export async function executeTabCommand(payload: {
  accountId: string;
  command: GeminiExecutorCommand;
  prompt?: string;
}): Promise<GeminiExecutorResult> {
  const res = await send({ type: "tab.command.execute", payload });
  if (!res.ok || !("exec" in res)) throw new Error((res as any).error || "tab.command.execute failed");
  return res.exec;
}

export async function sendPrompt(payload: {
  accountId: string;
  model: string;
  prompt: string;
}): Promise<ChatResult> {
  const res = await send({ type: "chat.send", payload });
  if (!res.ok || !("result" in res)) throw new Error((res as any).error || "chat.send failed");
  return res.result;
}

export async function clearHistory(): Promise<void> {
  const res = await send({ type: "history.clear" });
  if (!res.ok) throw new Error(res.error);
}

export async function getBackendStatus(): Promise<BackendConnectionStatus> {
  const res = await send({ type: "backend.status.get" });
  if (!res.ok || !("backend" in res)) throw new Error((res as any).error || "backend.status.get failed");
  return res.backend;
}

export async function setBackendConfig(payload: BackendConnectionConfig): Promise<BackendConnectionStatus> {
  const res = await send({ type: "backend.config.set", payload });
  if (!res.ok || !("backend" in res)) throw new Error((res as any).error || "backend.config.set failed");
  return res.backend;
}

export async function reconnectBackend(): Promise<BackendConnectionStatus> {
  const res = await send({ type: "backend.reconnect" });
  if (!res.ok || !("backend" in res)) throw new Error((res as any).error || "backend.reconnect failed");
  return res.backend;
}
