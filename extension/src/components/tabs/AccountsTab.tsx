import { Button, Card, Space, Typography } from "antd";
import type { Account, ExtensionState } from "../../lib/types";

const { Text } = Typography;

interface Props {
  accounts: Account[];
  state: ExtensionState;
  onAddAccount: () => void;
  onSelectAccount: (id: string) => void;
  onOpenTab: (id: string) => void;
  onDeleteAccount: (id: string) => void;
}

export default function AccountsTab(props: Props) {
  const { accounts, state, onAddAccount, onSelectAccount, onOpenTab, onDeleteAccount } = props;
  return (
    <Card title="Accounts" size="small">
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Button type="primary" onClick={onAddAccount}>Add Account</Button>
        <Space direction="vertical" size={8} style={{ width: "100%" }}>
          {accounts.map((account) => (
            <Card key={account.id} size="small">
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Text strong>{account.label}</Text>
                <Text type="secondary">
                  {account.id} | model: {account.defaultModel} | busy: {String(state.busy.accounts[account.id] || false)}
                </Text>
                <Space wrap>
                  <Button onClick={() => onSelectAccount(account.id)}>Select</Button>
                  <Button onClick={() => onOpenTab(account.id)}>Open Tab</Button>
                  <Button danger onClick={() => onDeleteAccount(account.id)}>Delete</Button>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      </Space>
    </Card>
  );
}
