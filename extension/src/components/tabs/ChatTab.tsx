import { Button, Card, Input, Select, Space, Typography } from "antd";

const { Paragraph, Text } = Typography;

interface Option {
  label: string;
  value: string;
}

interface Props {
  accountOptions: Option[];
  activeAccountId?: string;
  prompt: string;
  resultText: string;
  onChangeAccount: (id: string) => void;
  onChangePrompt: (v: string) => void;
  onSendPrompt: () => void;
}

export default function ChatTab(props: Props) {
  const {
    accountOptions,
    activeAccountId,
    prompt,
    resultText,
    onChangeAccount,
    onChangePrompt,
    onSendPrompt
  } = props;
  return (
    <Card title="Chat Test (Gemini)" size="small">
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          <Select
            style={{ minWidth: 180 }}
            value={activeAccountId}
            options={accountOptions}
            onChange={onChangeAccount}
            placeholder="Select account"
          />
          <Button type="primary" onClick={onSendPrompt}>Send Prompt</Button>
        </Space>
        <Input.TextArea
          className="chat-box"
          value={prompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          placeholder="Enter prompt..."
        />
        <div>
          <Text strong>Latest response</Text>
          <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
            <pre>{resultText || "(empty)"}</pre>
          </Paragraph>
        </div>
      </Space>
    </Card>
  );
}
