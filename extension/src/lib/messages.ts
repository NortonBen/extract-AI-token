import type {
  Account,
  AppBehaviorConfig,
  BackendConnectionConfig,
  BackendConnectionStatus,
  ChatResult,
  DashboardSummary,
  EnsureTabRequest,
  ExtensionState,
  GeminiExecutorCommand,
  GeminiExecutorResult,
  SendPromptRequest,
  UsageStats
} from "./types";

export type ExtensionMessage =
  | { type: "state.get" }
  | { type: "account.upsert"; payload: Omit<Account, "createdAt" | "updatedAt"> }
  | { type: "account.delete"; payload: { accountId: string } }
  | { type: "account.detect-root" }
  | { type: "tab.ensure"; payload: EnsureTabRequest }
  | { type: "tab.command.execute"; payload: { accountId: string; command: GeminiExecutorCommand; prompt?: string } }
  | { type: "openai.chat.send"; payload: SendPromptRequest }
  | { type: "chat.send"; payload: SendPromptRequest }
  | { type: "chat.stop"; payload: { accountId: string } }
  | { type: "account.set-enabled"; payload: { accountId: string; enabled: boolean } }
  | { type: "history.clear" }
  | { type: "usage.get" }
  | { type: "usage.reset" }
  | { type: "dashboard.get" }
  | { type: "backend.status.get" }
  | { type: "backend.config.set"; payload: BackendConnectionConfig }
  | { type: "backend.reconnect" }
  | { type: "behavior.get" }
  | { type: "behavior.set"; payload: Partial<AppBehaviorConfig> };

export type ExtensionMessageResponse =
  | { ok: true; state: ExtensionState }
  | { ok: true; dashboard: DashboardSummary }
  | { ok: true; usage: UsageStats }
  | { ok: true; tabId: number }
  | {
      ok: true;
      preview: {
        pageRoot: string;
        userIndex: number | null;
        displayName: string;
        email: string;
        avatarUrl: string;
        tier: string;
      };
    }
  | { ok: true; result: ChatResult }
  | { ok: true; exec: GeminiExecutorResult }
  | { ok: true; backend: BackendConnectionStatus }
  | { ok: true; behavior: AppBehaviorConfig }
  | { ok: true }
  | { ok: false; error: string };
