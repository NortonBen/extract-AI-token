import { useMemo, useState } from "react";
import { Avatar, Button, Card, Empty, Input, Select, Space, Switch, Tag, Tooltip, Typography, message } from "antd";
import {
  ClearOutlined,
  CopyOutlined,
  MessageOutlined,
  RobotOutlined,
  SendOutlined,
  StopOutlined
} from "@ant-design/icons";

const { Text } = Typography;

interface Option {
  label: string;
  value: string;
}

interface Props {
  accountOptions: Option[];
  activeAccountId?: string;
  prompt: string;
  resultText: string;
  isSending: boolean;
  streamEnabled: boolean;
  onToggleStream: (v: boolean) => void;
  onChangeAccount: (id: string) => void;
  onChangePrompt: (v: string) => void;
  onSendPrompt: () => void;
  onStopPrompt: () => void;
  onClearResponse: () => void;
}

export default function ChatTab(props: Props) {
  const {
    accountOptions,
    activeAccountId,
    prompt,
    resultText,
    isSending,
    streamEnabled,
    onToggleStream,
    onChangeAccount,
    onChangePrompt,
    onSendPrompt,
    onStopPrompt,
    onClearResponse
  } = props;

  const [messageApi, contextHolder] = message.useMessage();

  const stats = useMemo(() => {
    const text = resultText || "";
    const chars = text.length;
    const lines = text ? text.split("\n").length : 0;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { chars, lines, words };
  }, [resultText]);

  const [collapsed, setCollapsed] = useState(false);

  async function copyToClipboard() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      messageApi.success("Copied to clipboard");
    } catch {
      messageApi.error("Cannot copy to clipboard");
    }
  }

  return (
    <Card title="Chat Test" size="small">
      {contextHolder}
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          <Select
            style={{ minWidth: 180 }}
            value={activeAccountId}
            options={accountOptions}
            onChange={onChangeAccount}
            placeholder="Select account"
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onSendPrompt}
            loading={isSending}
            disabled={isSending}
          >
            Send Prompt
          </Button>
          <Tooltip title="Stop current generation">
            <Button danger icon={<StopOutlined />} onClick={onStopPrompt} disabled={!isSending}>
              Stop
            </Button>
          </Tooltip>
          <Tooltip title="Use OpenAI-compatible SSE (stream=true)">
            <Space size={6}>
              <Switch checked={streamEnabled} onChange={onToggleStream} size="small" />
              <Text type="secondary">stream</Text>
            </Space>
          </Tooltip>
        </Space>
        <Input.TextArea
          className="chat-box"
          value={prompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          placeholder="Enter prompt..."
        />

        {/* Latest response */}
        <div className="response-card">
          <div className="response-header">
            <Space size={8} align="center">
              <Avatar
                size={28}
                style={{ backgroundColor: "#7c3aed" }}
                icon={<RobotOutlined />}
              />
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                <Text strong>Latest response</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {resultText ? "Gemini assistant" : "Awaiting first reply"}
                </Text>
              </div>
              {isSending ? (
                <Tag color="processing" icon={<MessageOutlined />}>
                  generating…
                </Tag>
              ) : resultText ? (
                <Tag color="success">ready</Tag>
              ) : null}
            </Space>
            <Space size={4}>
              {resultText ? (
                <Tooltip title={collapsed ? "Expand" : "Collapse"}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => setCollapsed((v) => !v)}
                  >
                    {collapsed ? "Show" : "Hide"}
                  </Button>
                </Tooltip>
              ) : null}
              <Tooltip title="Copy response">
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={copyToClipboard}
                  disabled={!resultText}
                />
              </Tooltip>
              <Tooltip title="Clear response">
                <Button
                  size="small"
                  type="text"
                  icon={<ClearOutlined />}
                  onClick={() => {
                    onClearResponse();
                    messageApi.success("Response cleared");
                  }}
                  disabled={!resultText}
                />
              </Tooltip>
            </Space>
          </div>

          {!collapsed && (
            <div className="response-body">
              {resultText ? (
                <pre className="response-text">{resultText}</pre>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Type a prompt and press <b>Send</b> to see the assistant reply here.
                    </Text>
                  }
                  styles={{ image: { height: 36 } }}
                />
              )}
            </div>
          )}

          {resultText && !collapsed ? (
            <div className="response-footer">
              <Text type="secondary" style={{ fontSize: 11 }}>
                {stats.chars} chars · {stats.words} words · {stats.lines} lines
              </Text>
            </div>
          ) : null}
        </div>
      </Space>
    </Card>
  );
}
