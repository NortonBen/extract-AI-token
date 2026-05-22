import { Card, Col, Row, Statistic, Typography } from "antd";
import { Column, Pie } from "@ant-design/charts";
import type { DashboardSummary, ExtensionState } from "../../lib/types";

interface Props {
  dashboard: DashboardSummary;
  state: ExtensionState;
}

export default function DashboardTab(props: Props) {
  const { dashboard, state } = props;
  const kpiData = [
    { key: "Accounts", value: dashboard.accountCount },
    { key: "Enabled", value: dashboard.enabledAccountCount },
    { key: "Open tabs", value: dashboard.openGeminiTabCount },
    { key: "Busy", value: dashboard.busyCount },
    { key: "History", value: dashboard.historyCount }
  ];

  const activityData = [
    { type: "Busy", value: dashboard.busyCount },
    { type: "Idle", value: Math.max(dashboard.enabledAccountCount - dashboard.busyCount, 0) }
  ];

  return (
    <Card title="Dashboard" size="small">
      <Typography.Text type="secondary">Overview</Typography.Text>
      <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
        <Col xs={12} sm={12}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic title="Accounts" value={dashboard.accountCount} />
          </Card>
        </Col>
        <Col xs={12} sm={12}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic title="Enabled" value={dashboard.enabledAccountCount} />
          </Card>
        </Col>
        <Col xs={12} sm={12}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic title="Open tabs" value={dashboard.openGeminiTabCount} />
          </Card>
        </Col>
        <Col xs={12} sm={12}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic title="Busy" value={dashboard.busyCount} />
          </Card>
        </Col>
        <Col xs={12} sm={12}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic title="History" value={dashboard.historyCount} />
          </Card>
        </Col>
        <Col xs={12} sm={12}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Statistic title="Global busy" value={state.busy.globalBusy ? "true" : "false"} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[10, 10]} style={{ marginTop: 10 }}>
        <Col span={24}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Typography.Text strong>KPI Chart</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Column
                height={220}
                data={kpiData}
                xField="key"
                yField="value"
                axis={{ x: { labelAutoRotate: false } }}
                tooltip={{ title: "key" }}
                style={{ radiusTopLeft: 6, radiusTopRight: 6 }}
              />
            </div>
          </Card>
        </Col>
        <Col span={24}>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Typography.Text strong>Account Activity</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Pie
                height={220}
                data={activityData}
                angleField="value"
                colorField="type"
                innerRadius={0.6}
                legend={{ color: { position: "bottom", layout: { justifyContent: "center" } } }}
                labels={[]}
              />
            </div>
          </Card>
        </Col>
      </Row>
    </Card>
  );
}
