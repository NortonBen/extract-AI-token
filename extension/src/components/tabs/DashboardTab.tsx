import { Badge, Card, Col, List, Row, Statistic, Tag, Tooltip, Typography } from "antd";
import {
  ApiOutlined,
  CheckCircleFilled,
  DisconnectOutlined,
  LockOutlined,
  LoadingOutlined,
  UnlockOutlined
} from "@ant-design/icons";
import type { DashboardSummary, ExtensionState } from "../../lib/types";

const { Text, Paragraph } = Typography;

interface Props {
  dashboard: DashboardSummary;
  state: ExtensionState;
}

export default function DashboardTab(props: Props) {
  const { dashboard, state } = props;
  // Derive from state when available (always populated locally), fall back to
  // backend-provided dashboard counters (which may lag or be 0 while WS is
  // reconnecting).
  const accountCount = state.accounts.length || dashboard.accountCount;
  const enabledCount =
    state.accounts.filter((a) => a.enabled).length || dashboard.enabledAccountCount;
  const openTabCount = state.tabs.length || dashboard.openGeminiTabCount;
  const busyCount =
    Object.values(state.busy.accounts || {}).filter(Boolean).length || dashboard.busyCount;
  const promptTokens = dashboard.promptTokens ?? 0;
  const completionTokens = dashboard.completionTokens ?? 0;
  const totalTokens = dashboard.totalTokens ?? promptTokens + completionTokens;
  const historySavedTotal = dashboard.historySavedTotal ?? 0;
  const tabsByAccount = new Map(state.tabs.map((t) => [t.accountId, t]));

  return (
    <Card title="Dashboard" size="small">
      {/* KPI row */}
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic title="Accounts" value={accountCount} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic
              title="Active"
              value={enabledCount}
              prefix={<UnlockOutlined style={{ color: "#16a34a" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic title="Open tabs" value={openTabCount} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic
              title="Busy"
              value={busyCount}
              prefix={busyCount > 0 ? <LoadingOutlined /> : null}
              valueStyle={{ color: busyCount > 0 ? "#f59e0b" : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic title="Token input" value={promptTokens} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic title="Token output" value={completionTokens} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic title="Token tổng" value={totalTokens} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" styles={{ body: { padding: 10 } }}>
            <Statistic title="History đã ghi" value={historySavedTotal} />
          </Card>
        </Col>
      </Row>

      {/* Backend */}
      <Row gutter={[8, 8]} style={{ marginTop: 10 }}>
        <Col span={24}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Text strong>
              <ApiOutlined /> Backend
            </Text>
            <div style={{ marginTop: 8 }}>
              <Tag
                color={state.backend.connected ? "success" : "error"}
                icon={state.backend.connected ? <CheckCircleFilled /> : <DisconnectOutlined />}
              >
                {state.backend.connected ? "Connected" : "Disconnected"}
              </Tag>
              <Text type="secondary" style={{ marginLeft: 8 }}>
                {state.backend.host}:{state.backend.port}
              </Text>
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                · Global busy: {state.busy.globalBusy ? "yes" : "no"}
              </Text>
              {state.backend.lastError ? (
                <Paragraph
                  style={{ marginTop: 6, marginBottom: 0, fontSize: 12 }}
                  type="danger"
                  ellipsis={{ rows: 2, tooltip: state.backend.lastError }}
                >
                  {state.backend.lastError}
                </Paragraph>
              ) : null}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Accounts overview */}
      <Card
        size="small"
        title="Accounts overview"
        style={{ marginTop: 10 }}
        styles={{ body: { padding: 0 } }}
      >
        {state.accounts.length === 0 ? (
          <div style={{ padding: 12 }}>
            <Text type="secondary">No accounts configured.</Text>
          </div>
        ) : (
          <List
            size="small"
            dataSource={state.accounts}
            renderItem={(account) => {
              const locked = !account.enabled;
              const busy = Boolean(state.busy.accounts[account.id]);
              const tab = tabsByAccount.get(account.id);
              return (
                <List.Item style={{ padding: "8px 12px" }}>
                  <List.Item.Meta
                    avatar={
                      <Tooltip title={locked ? "Locked" : "Active"}>
                        {locked ? (
                          <LockOutlined style={{ color: "#ef4444", fontSize: 16 }} />
                        ) : (
                          <UnlockOutlined style={{ color: "#16a34a", fontSize: 16 }} />
                        )}
                      </Tooltip>
                    }
                    title={
                      <span>
                        {account.label}{" "}
                        {busy ? (
                          <Tag color="warning" icon={<LoadingOutlined />}>
                            busy
                          </Tag>
                        ) : (
                          <Tag color="default">idle</Tag>
                        )}
                      </span>
                    }
                    description={
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {account.defaultModel}
                          {account.userIndex !== null ? ` · /u/${account.userIndex}` : ""}
                        </Text>
                        <div>
                          {tab ? (
                            <Badge status="processing" text={`tab #${tab.tabId}`} />
                          ) : (
                            <Badge status="default" text="no tab" />
                          )}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>

    </Card>
  );
}
