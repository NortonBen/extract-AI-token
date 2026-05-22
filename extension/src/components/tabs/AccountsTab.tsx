import { Button, Card, Space, Tooltip, Typography } from "antd";
import { LockOutlined, UnlockOutlined } from "@ant-design/icons";
import type { Account, ExtensionState } from "../../lib/types";

const { Text } = Typography;

interface Props {
  accounts: Account[];
  state: ExtensionState;
  onAddAccount: () => void;
  onSelectAccount: (id: string) => void;
  onOpenTab: (id: string) => void;
  onDeleteAccount: (id: string) => void;
  onToggleLock: (id: string, enabled: boolean) => void;
}

export default function AccountsTab(props: Props) {
  const {
    accounts,
    state,
    onAddAccount,
    onSelectAccount,
    onOpenTab,
    onDeleteAccount,
    onToggleLock
  } = props;
  return (
    <Card title="Accounts" size="small">
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Button type="primary" onClick={onAddAccount}>Add Account</Button>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          {accounts.map((account) => {
            const locked = !account.enabled;
            return (
              <Card key={account.id} size="small">
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  <Space size={8} align="center">
                    <Tooltip title={locked ? "Locked — click to enable" : "Active — click to lock"}>
                      <Button
                        type="text"
                        size="small"
                        icon={
                          locked ? (
                            <LockOutlined style={{ color: "#ef4444" }} />
                          ) : (
                            <UnlockOutlined style={{ color: "#16a34a" }} />
                          )
                        }
                        onClick={() => onToggleLock(account.id, locked)}
                        aria-label={locked ? "Unlock account" : "Lock account"}
                      />
                    </Tooltip>
                    <Text strong>{account.label}</Text>
                  </Space>
                  <Text type="secondary">
                    {account.id} | model: {account.defaultModel} | busy:{" "}
                    {String(state.busy.accounts[account.id] || false)}
                  </Text>
                  <Space wrap>
                    <Button onClick={() => onSelectAccount(account.id)}>Select</Button>
                    <Button onClick={() => onOpenTab(account.id)}>Open Tab</Button>
                    <Button danger onClick={() => onDeleteAccount(account.id)}>Delete</Button>
                  </Space>
                </Space>
              </Card>
            );
          })}
        </Space>
      </Space>
    </Card>
  );
}
