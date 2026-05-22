import type { AccountTab, BackendConnectionConfig } from "./types";

const TABS_KEY = "ai_browser_extension_tabs";
const BACKEND_CONFIG_KEY = "ai_browser_backend_config";

const defaultBackendConfig: BackendConnectionConfig = {
  host: "127.0.0.1",
  port: 9516
};

export async function getTabs(): Promise<AccountTab[]> {
  const data = await chrome.storage.local.get(TABS_KEY);
  const tabs = data[TABS_KEY];
  if (!Array.isArray(tabs)) return [];
  return tabs as AccountTab[];
}

export async function setAccountTab(tab: AccountTab): Promise<void> {
  const tabs = await getTabs();
  const index = tabs.findIndex((item) => item.accountId === tab.accountId);
  if (index >= 0) tabs[index] = tab;
  else tabs.push(tab);
  await chrome.storage.local.set({ [TABS_KEY]: tabs });
}

export async function removeAccountTab(accountId: string): Promise<void> {
  const tabs = await getTabs();
  const next = tabs.filter((item) => item.accountId !== accountId);
  await chrome.storage.local.set({ [TABS_KEY]: next });
}

export async function getBackendConfig(): Promise<BackendConnectionConfig> {
  const data = await chrome.storage.local.get(BACKEND_CONFIG_KEY);
  const raw = data[BACKEND_CONFIG_KEY] as Partial<BackendConnectionConfig> | undefined;
  if (!raw) return defaultBackendConfig;
  const host = typeof raw.host === "string" && raw.host.trim() ? raw.host.trim() : defaultBackendConfig.host;
  const port = Number.isInteger(raw.port) && raw.port! > 0 ? raw.port! : defaultBackendConfig.port;
  return { host, port };
}

export async function setBackendConfig(config: BackendConnectionConfig): Promise<BackendConnectionConfig> {
  const normalized: BackendConnectionConfig = {
    host: config.host.trim() || defaultBackendConfig.host,
    port: Number.isInteger(config.port) && config.port > 0 ? config.port : defaultBackendConfig.port
  };
  await chrome.storage.local.set({ [BACKEND_CONFIG_KEY]: normalized });
  return normalized;
}

export function createAccountId(provider: "gemini" | "chatgpt", userIndex: number): string {
  return `${provider}-u${userIndex}`;
}

export function buildGeminiUrl(userIndex: number): string {
  return `https://gemini.google.com/u/${userIndex}/app`;
}
