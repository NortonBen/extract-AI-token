export type Provider = "gemini" | "chatgpt";

export interface Account {
  id: string;
  provider: Provider;
  userIndex: number | null;
  pageRoot: string;
  label: string;
  enabled: boolean;
  defaultModel: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountTab {
  accountId: string;
  tabId: number;
  windowId?: number;
  url: string;
  updatedAt: string;
}

export interface HistoryMessage {
  id: string;
  accountId: string;
  model: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface BusyState {
  globalBusy: boolean;
  accounts: Record<string, boolean>;
}

export interface UsageStats {
  historyStoredCount: number;
  historySavedTotal: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface DashboardSummary {
  accountCount: number;
  enabledAccountCount: number;
  openGeminiTabCount: number;
  historyCount: number;
  busyCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  historySavedTotal: number;
}

export interface ExtensionState {
  accounts: Account[];
  tabs: AccountTab[];
  history: HistoryMessage[];
  busy: BusyState;
  backend: BackendConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BackendConnectionConfig {
  host: string;
  port: number;
}

export type AfterChatBehavior = "new_tab" | "reload" | "keep";

export interface AppBehaviorConfig {
  afterChat: AfterChatBehavior;
}

export interface BackendConnectionStatus extends BackendConnectionConfig {
  connected: boolean;
  lastError: string | null;
}

export interface EnsureTabRequest {
  accountId: string;
}

export interface SendPromptRequest {
  accountId: string;
  model: string;
  prompt: string;
  stream?: boolean;
}

export interface ChatResult {
  accountId: string;
  model: string;
  responseText: string;
}

export interface GeminiAccountPreview {
  pageRoot: string;
  userIndex: number | null;
  displayName: string;
  email: string;
  avatarUrl: string;
  tier: string;
}

export type GeminiExecutorCommand = "ping" | "detect_account" | "send_prompt" | "read_response";

export interface GeminiExecutorResult {
  command: GeminiExecutorCommand;
  ok: boolean;
  responseText?: string;
  preview?: GeminiAccountPreview;
  error?: string;
}
