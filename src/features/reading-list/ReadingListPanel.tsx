import type { ReadingListStatus } from "@/types/readingList";
import type { ReadingListGroup, ReadingListSummary, ReadingListViewItem } from "./index";

export interface ReadingListPanelProps {
  groups: ReadingListGroup[];
  items: ReadingListViewItem[];
  summary: ReadingListSummary;
  busyId: number | null;
  message: string;
  onChangeStatus: (item: ReadingListViewItem, status: ReadingListStatus) => void;
}

const STATUS_ACTIONS: { status: ReadingListStatus; label: string }[] = [
  { status: "done", label: "已读" },
  { status: "later", label: "稍后" },
];

export function ReadingListPanel({
  groups,
  items,
  summary,
  busyId,
  message,
  onChangeStatus,
}: ReadingListPanelProps) {
  return (
    <>
      <div className="mt-5 text-sm font-medium">待读书单</div>
      <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>全部：{summary.total}</div>
          <div>待读：{summary.byStatus.todo}</div>
          <div>稍后：{summary.byStatus.later}</div>
          <div>已读：{summary.byStatus.done}</div>
          <div className="col-span-2">已读停留：{summary.doneDwellSeconds}s</div>
        </div>
        {items.length === 0 ? (
          <div>暂无待读资料</div>
        ) : (
          groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div className="space-y-2" key={group.status}>
                <div className="text-xs font-medium text-[var(--color-ink)]">
                  {group.label} · {group.items.length}
                </div>
                {group.items.slice(0, 3).map((item) => (
                  <div
                    className="border-b border-[var(--color-border)] pb-2 last:border-b-0 last:pb-0"
                    key={item.id ?? `${item.title}-${item.addedAt}`}
                  >
                    <div className="font-medium text-[var(--color-ink)]">
                      {item.url ? (
                        <a href={item.url} rel="noreferrer" target="_blank">
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </div>
                    <div>
                      {item.kind} · {item.status}
                    </div>
                    <div className="mt-2 flex gap-2">
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
                ))}
              </div>
            ))
        )}
        <div>{message}</div>
      </div>
    </>
  );
}
