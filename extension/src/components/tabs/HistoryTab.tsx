import { useMemo, useState } from "react";
import { Button, Card, Empty, Input, List, Pagination, Select, Space, Tag, Typography } from "antd";
import { ClearOutlined, SearchOutlined } from "@ant-design/icons";
import type { HistoryMessage } from "../../lib/types";

const { Paragraph, Text } = Typography;

interface Props {
  history: HistoryMessage[];
  onClearHistory: () => void;
}

function shortDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function HistoryTab(props: Props) {
  const { history, onClearHistory } = props;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "user" | "assistant">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...history]
      .reverse() // newest first (backend returns desc, but ensure)
      .filter((item) => {
        if (roleFilter !== "all" && item.role !== roleFilter) return false;
        if (!q) return true;
        return (
          item.content.toLowerCase().includes(q) ||
          item.model.toLowerCase().includes(q) ||
          item.accountId.toLowerCase().includes(q)
        );
      });
  }, [history, query, roleFilter]);

  const total = filtered.length;
  const startIdx = (page - 1) * pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + pageSize);

  // Clamp page if filters shrink the list
  if (page > 1 && pageItems.length === 0 && total > 0) {
    setPage(1);
  }

  return (
    <Card
      title="History"
      size="small"
      extra={
        <Button icon={<ClearOutlined />} onClick={onClearHistory} danger>
          Clear All
        </Button>
      }
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search content / model / account"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            style={{ width: 240 }}
          />
          <Select
            value={roleFilter}
            onChange={(v) => {
              setRoleFilter(v);
              setPage(1);
            }}
            options={[
              { label: "All", value: "all" },
              { label: "User", value: "user" },
              { label: "Assistant", value: "assistant" }
            ]}
            style={{ width: 120 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {total} message{total === 1 ? "" : "s"}
          </Text>
        </Space>

        {pageItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {query || roleFilter !== "all" ? "No matching messages" : "No history yet"}
              </Text>
            }
          />
        ) : (
          <List
            size="small"
            dataSource={pageItems}
            renderItem={(item) => (
              <List.Item style={{ padding: "8px 4px", borderBottom: "1px dashed #eef0f4" }}>
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <Space size={6} wrap>
                    <Tag color={item.role === "assistant" ? "blue" : "green"}>{item.role}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {shortDateTime(item.createdAt)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      · {item.model}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      · {item.accountId}
                    </Text>
                  </Space>
                  <Paragraph
                    style={{ margin: 0, fontSize: 13 }}
                    ellipsis={{ rows: 4, expandable: true, symbol: "more" }}
                  >
                    {item.content}
                  </Paragraph>
                </Space>
              </List.Item>
            )}
          />
        )}

        {total > 0 ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Pagination
              size="small"
              current={page}
              total={total}
              pageSize={pageSize}
              pageSizeOptions={[5, 10, 20, 50]}
              showSizeChanger
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              onShowSizeChange={(_, ps) => {
                setPage(1);
                setPageSize(ps);
              }}
            />
          </div>
        ) : null}
      </Space>
    </Card>
  );
}
