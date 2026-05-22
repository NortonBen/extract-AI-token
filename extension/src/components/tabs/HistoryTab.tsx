import { Button, Card, Space, Typography } from "antd";
import type { HistoryMessage } from "../../lib/types";

const { Paragraph, Text } = Typography;

interface Props {
  history: HistoryMessage[];
  onClearHistory: () => void;
}

export default function HistoryTab(props: Props) {
  const { history, onClearHistory } = props;
  return (
    <Card
      title="History"
      size="small"
      extra={<Button onClick={onClearHistory}>Clear History</Button>}
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {history.slice(-20).reverse().map((item) => (
          <Card key={item.id} size="small">
            <Space direction="vertical" size={4}>
              <Text strong>{item.role}</Text>
              <Text type="secondary">{item.accountId} - {item.model}</Text>
              <Paragraph style={{ margin: 0 }}>{item.content.slice(0, 300)}</Paragraph>
            </Space>
          </Card>
        ))}
      </Space>
    </Card>
  );
}
