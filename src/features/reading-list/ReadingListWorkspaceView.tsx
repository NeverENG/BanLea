import type { ReadingListStatus } from "@/types/readingList";
import type { ReadingListGroup, ReadingListSummary, ReadingListViewItem } from "./index";

export interface ReadingListWorkspaceViewProps {
  groups: ReadingListGroup[];
  isLoading: boolean;
  items: ReadingListViewItem[];
  summary: ReadingListSummary;
  busyId: number | null;
  message: string;
  onRefresh: () => void;
  onChangeStatus: (item: ReadingListViewItem, status: ReadingListStatus) => void;
}

const STATUS_ACTIONS: { status: ReadingListStatus; label: string }[] = [
  { status: "todo", label: "待读" },
  { status: "reading", label: "阅读中" },
  { status: "done", label: "已读" },
  { status: "later", label: "稍后" },
];

const SUMMARY_ITEMS = [
  { key: "total", label: "全部" },
  { key: "todo", label: "待读" },
  { key: "reading", label: "阅读中" },
  { key: "done", label: "已读" },
  { key: "later", label: "稍后" },
] as const;

const KIND_LABELS: Record<string, string> = {
  article: "文章",
  video: "视频",
  repo: "代码库",
  doc: "文档",
};

function summaryValue(summary: ReadingListSummary, key: (typeof SUMMARY_ITEMS)[number]["key"]) {
  return key === "total" ? summary.total : summary.byStatus[key];
}

function itemKey(item: ReadingListViewItem): string {
  return item.id === null ? `${item.title}-${item.addedAt}` : String(item.id);
}

function formatAddedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

export function ReadingListWorkspaceView({
  groups,
  isLoading,
  items,
  summary,
  busyId,
  message,
  onRefresh,
  onChangeStatus,
}: ReadingListWorkspaceViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SUMMARY_ITEMS.map((item) => (
          <div
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-raised)] p-3"
            key={item.key}
          >
            <div className="text-xs text-[var(--color-muted)]">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              {summaryValue(summary, item.key)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-raised)] p-3 text-sm text-[var(--color-muted)]">
        <div className="truncate">{isLoading ? "读取中" : message}</div>
        <button
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-50"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          刷新
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-raised)] p-5 text-sm text-[var(--color-muted)]">
          暂无待读资料
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <section
              className="min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-raised)]"
              key={group.status}
            >
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                <div className="text-sm font-medium text-[var(--color-ink)]">
                  {group.label}
                </div>
                <div className="text-xs text-[var(--color-muted)]">
                  {group.items.length}
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {group.items.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-[var(--color-muted)]">
                    暂无条目
                  </div>
                ) : (
                  group.items.map((item) => (
                    <div className="space-y-3 px-4 py-4" key={itemKey(item)}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[var(--color-ink)]">
                          {item.url ? (
                            <a href={item.url} rel="noreferrer" target="_blank">
                              {item.title}
                            </a>
                          ) : (
                            item.title
                          )}
                        </div>
                        <div className="mt-1 text-xs text-[var(--color-muted)]">
                          {KIND_LABELS[item.kind] ?? item.kind} · {formatAddedAt(item.addedAt)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_ACTIONS.map((action) => (
                          <button
                            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50"
                            disabled={
                              item.id === null ||
                              busyId === item.id ||
                              item.status === action.status
                            }
                            key={action.status}
                            onClick={() => onChangeStatus(item, action.status)}
                            type="button"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
