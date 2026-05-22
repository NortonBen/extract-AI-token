import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Tabs,
  Tooltip,
  Typography
} from "antd";
import { ReloadOutlined, SettingOutlined, CheckCircleFilled, DisconnectOutlined } from "@ant-design/icons";
import {
  clearHistory,
  deleteAccount,
  ensureTab,
  detectGeminiRootFromActiveTab,
  getBackendStatus,
  getDashboard,
  getState,
  reconnectBackend,
  setAccountEnabled,
  setBackendConfig,
  sendPrompt,
  stopPrompt,
  upsertAccount
} from "../lib/extension-api";
import { createAccountId } from "../lib/storage";
import type { BackendConnectionStatus, DashboardSummary, ExtensionState, GeminiAccountPreview } from "../lib/types";

const AccountsTab = lazy(() => import("./tabs/AccountsTab"));
const ChatTab = lazy(() => import("./tabs/ChatTab"));
const HistoryTab = lazy(() => import("./tabs/HistoryTab"));
const DashboardTab = lazy(() => import("./tabs/DashboardTab"));

const { Title, Text, Paragraph } = Typography;

const emptyDashboard: DashboardSummary = {
  accountCount: 0,
  enabledAccountCount: 0,
  openGeminiTabCount: 0,
  historyCount: 0,
  busyCount: 0
};

function makeFallbackState(host: string, port: string): ExtensionState {
  return {
    accounts: [],
    tabs: [],
    history: [],
    busy: { globalBusy: false, accounts: {} },
    backend: {
      host,
      port: Number(port) || 9516,
      connected: false,
      lastError: "Backend unavailable"
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [state, setState] = useState<ExtensionState>(() => makeFallbackState("127.0.0.1", "9516"));
  const [dashboard, setDashboard] = useState<DashboardSummary>(emptyDashboard);
  const [prompt, setPrompt] = useState("");
  const [activeAccountId, setActiveAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState("");
  const [backendStatus, setBackendStatus] = useState<BackendConnectionStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [backendHost, setBackendHost] = useState("127.0.0.1");
  const [backendPort, setBackendPort] = useState("9516");
  const [detectedPreview, setDetectedPreview] = useState<GeminiAccountPreview | null>(null);
  const [addAccountError, setAddAccountError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(false);

  const [settingsForm] = Form.useForm<{ host: string; port: string }>();
  const [accountForm] = Form.useForm<{ pageRoot: string; label: string }>();

  const accounts = state.accounts ?? [];
  const history = state.history ?? [];
  const activeAccount = useMemo(
    () => accounts.find((item) => item.id === activeAccountId) ?? accounts[0],
    [accounts, activeAccountId]
  );

  async function reload() {
    const [stateRes, dashboardRes, backendRes] = await Promise.allSettled([
      getState(),
      getDashboard(),
      getBackendStatus()
    ]);

    const fallbackState: ExtensionState = makeFallbackState(backendHost, backendPort);
    const nextState = stateRes.status === "fulfilled" ? stateRes.value : fallbackState;
    const nextDashboard = dashboardRes.status === "fulfilled" ? dashboardRes.value : emptyDashboard;
    const nextBackend =
      backendRes.status === "fulfilled"
        ? backendRes.value
        : {
            host: nextState.backend?.host || backendHost,
            port: nextState.backend?.port || Number(backendPort) || 9516,
            connected: false,
            lastError: "Backend unavailable"
          };

    setState(nextState);
    setDashboard(nextDashboard);
    setBackendStatus(nextBackend);
    setBackendHost(nextBackend.host);
    setBackendPort(String(nextBackend.port));
    settingsForm.setFieldsValue({ host: nextBackend.host, port: String(nextBackend.port) });
    if (nextBackend.connected) {
      setError(null);
    }

    const firstAccount = nextState.accounts?.[0];
    if (firstAccount && !activeAccountId) {
      setActiveAccountId(firstAccount.id);
    }
  }

  useEffect(() => {
    accountForm.setFieldsValue({ pageRoot: "", label: "Gemini User" });
    reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Cannot load extension state");
    });
    const timer = window.setInterval(() => {
      reload().catch(() => {
        // silent refresh failure — keep last good state
      });
    }, 3000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  async function onCreateAccount(values: { pageRoot: string; label: string }) {
    const pageRoot = values.pageRoot.trim();
    if (!pageRoot) {
      setAddAccountError("Please detect Gemini page root from an active Gemini tab.");
      return;
    }
    const index = detectedPreview?.pageRoot === pageRoot ? detectedPreview.userIndex : null;
    const id = index !== null
      ? createAccountId("gemini", index)
      : `gemini-root-${pageRoot.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
    await upsertAccount({
      id,
      provider: "gemini",
      userIndex: index,
      pageRoot,
      label: values.label.trim() || "Gemini User",
      enabled: true,
      defaultModel: "gemini-flash"
    });
    setActiveAccountId(id);
    setAddAccountOpen(false);
    setDetectedPreview(null);
    setAddAccountError(null);
    accountForm.resetFields();
    accountForm.setFieldsValue({ pageRoot: "", label: "Gemini User" });
    await reload();
  }

  async function onDetectPageRoot() {
    try {
      const detected = await detectGeminiRootFromActiveTab();
      setDetectedPreview(detected);
      accountForm.setFieldsValue({ pageRoot: detected.pageRoot });
      if (detected.displayName) {
        accountForm.setFieldsValue({ label: detected.displayName });
      }
      setAddAccountError(null);
    } catch (err) {
      setAddAccountError(err instanceof Error ? err.message : "Cannot detect Gemini page root");
    }
  }

  async function onDeleteAccount(accountId: string) {
    await deleteAccount(accountId);
    await reload();
  }

  async function onOpenTab(accountId: string) {
    await ensureTab(accountId);
    await reload();
  }

  async function onSendPrompt() {
    if (!activeAccount) {
      setError("Select an account first.");
      return;
    }
    try {
      setError(null);
      setIsSending(true);
      const res = await sendPrompt({
        accountId: activeAccount.id,
        model: activeAccount.defaultModel,
        prompt,
        stream: streamEnabled
      });
      setResultText(res.responseText);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send prompt failed");
    } finally {
      setIsSending(false);
    }
  }

  async function onStopPrompt() {
    if (!activeAccount) return;
    try {
      await stopPrompt(activeAccount.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stop failed");
    }
  }

  async function onToggleLock(accountId: string, enabled: boolean) {
    try {
      await setAccountEnabled(accountId, enabled);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toggle lock failed");
    }
  }

  async function onClearHistory() {
    await clearHistory();
    await reload();
  }

  async function onSaveBackendSettings(values: { host: string; port: string }) {
    const portNum = Number(values.port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
      setError("Port must be an integer between 1 and 65535.");
      return;
    }
    setError(null);
    await setBackendConfig({ host: values.host.trim(), port: portNum });
    await reconnectBackend();
    setSettingsOpen(false);
    await reload();
  }

  async function onReconnectBackend() {
    await reconnectBackend();
    await reload();
  }

  const accountOptions = accounts.map((item) => ({ label: item.label, value: item.id }));

  return (
    <div className="page">
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%" }}>
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/icon/logo.svg" alt="Extract Token" width={28} height={28} style={{ flexShrink: 0 }} />
            <Title level={2} style={{ margin: 0, lineHeight: 1.15 }}>Extract Token</Title>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              border: "1px solid #e5e7eb",
              borderRadius: 999,
              background: "#fff",
              flexShrink: 0
            }}
          >
            <Tooltip title="Reconnect Backend">
              <Button
                shape="circle"
                icon={<ReloadOutlined />}
                onClick={onReconnectBackend}
                aria-label="Reconnect Backend"
                size="small"
              />
            </Tooltip>
            <Tooltip title="Settings">
              <Button
                shape="circle"
                icon={<SettingOutlined />}
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                size="small"
              />
            </Tooltip>
            {backendStatus ? (
              <Tag
                color={backendStatus.connected ? "success" : "error"}
                style={{ marginInlineEnd: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {backendStatus.connected ? (
                  <CheckCircleFilled />
                ) : (
                  <DisconnectOutlined />
                )}
                {backendStatus.connected ? "Connected" : "Disconnected"}
              </Tag>
            ) : (
              <Tag style={{ marginInlineEnd: 0 }}>Unknown</Tag>
            )}
          </div>
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
        {backendStatus?.lastError ? <Alert type="warning" showIcon message={backendStatus.lastError} /> : null}

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          destroyInactiveTabPane
          items={[
            {
              key: "dashboard",
              label: "Dashboard",
              children: (
                <Suspense fallback={<CardSkeleton />}>
                  <DashboardTab dashboard={dashboard} state={state} />
                </Suspense>
              )
            },
            {
              key: "accounts",
              label: "Accounts",
              children: (
                <Suspense fallback={<CardSkeleton />}>
                  <AccountsTab
                    accounts={accounts}
                    state={state}
                    onAddAccount={() => {
                      setDetectedPreview(null);
                      setAddAccountError(null);
                      accountForm.setFieldsValue({ pageRoot: "", label: "Gemini User" });
                      setAddAccountOpen(true);
                    }}
                    onSelectAccount={setActiveAccountId}
                    onOpenTab={onOpenTab}
                    onDeleteAccount={onDeleteAccount}
                    onToggleLock={onToggleLock}
                  />
                </Suspense>
              )
            },
            {
              key: "chat",
              label: "Chat",
              children: (
                <Suspense fallback={<CardSkeleton />}>
                  <ChatTab
                    accountOptions={accountOptions}
                    activeAccountId={activeAccount?.id}
                    prompt={prompt}
                    resultText={resultText}
                    isSending={isSending}
                    streamEnabled={streamEnabled}
                    onToggleStream={setStreamEnabled}
                    onChangeAccount={setActiveAccountId}
                    onChangePrompt={setPrompt}
                    onSendPrompt={onSendPrompt}
                    onStopPrompt={onStopPrompt}
                    onClearResponse={() => setResultText("")}
                  />
                </Suspense>
              )
            },
            {
              key: "history",
              label: "History",
              children: (
                <Suspense fallback={<CardSkeleton />}>
                  <HistoryTab history={history} onClearHistory={onClearHistory} />
                </Suspense>
              )
            },
          ]}
        />
      </Space>

      <Modal
        title="Backend Settings"
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => settingsForm.submit()}
        okText="Save & Reconnect"
      >
        <Form form={settingsForm} layout="vertical" onFinish={onSaveBackendSettings}>
          <Form.Item label="Host" name="host" rules={[{ required: true, message: "Host is required" }]}>
            <Input placeholder="127.0.0.1" />
          </Form.Item>
          <Form.Item label="Port" name="port" rules={[{ required: true, message: "Port is required" }]}>
            <Input placeholder="9516" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add Gemini Account"
        open={addAccountOpen}
        onCancel={() => {
          setAddAccountOpen(false);
          setDetectedPreview(null);
          setAddAccountError(null);
        }}
        onOk={() => accountForm.submit()}
        okText="Create"
      >
        {addAccountError ? <Alert type="error" showIcon message={addAccountError} style={{ marginBottom: 12 }} /> : null}
        <Form form={accountForm} layout="vertical" onFinish={onCreateAccount}>
          <Form.Item label="Page Root" name="pageRoot" rules={[{ required: true, message: "Page root is required" }]}>
            <Input placeholder="https://gemini.google.com/app or /u/{n}/app" readOnly />
          </Form.Item>
          <Button onClick={onDetectPageRoot} style={{ marginBottom: 12 }}>Detect From Active Gemini Tab</Button>
          {detectedPreview ? (
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space align="start">
                <Avatar src={detectedPreview.avatarUrl || undefined}>
                  {detectedPreview.displayName?.slice(0, 1).toUpperCase() || "G"}
                </Avatar>
                <Descriptions size="small" column={1} colon={false}>
                  <Descriptions.Item label="Name">{detectedPreview.displayName || "(empty)"}</Descriptions.Item>
                  <Descriptions.Item label="Email">{detectedPreview.email || "(empty)"}</Descriptions.Item>
                  <Descriptions.Item label="Tier">{detectedPreview.tier || "Free"}</Descriptions.Item>
                  <Descriptions.Item label="Root">{detectedPreview.pageRoot}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>
          ) : null}
          <Form.Item label="Label" name="label" rules={[{ required: true, message: "Label is required" }]}>
            <Input placeholder="Gemini User" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}>
      <Text type="secondary">Loading tab...</Text>
    </div>
  );
}
