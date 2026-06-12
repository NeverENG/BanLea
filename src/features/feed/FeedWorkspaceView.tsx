import type {
  FeedRecommendationFeedbackKind,
  FeedRecommendationItem,
  FeedRecommendationViewModel,
} from "./index";

export interface FeedWorkspaceViewProps {
  busyId: string | null;
  isLoading: boolean;
  message: string;
  onFeedback: (
    item: FeedRecommendationItem,
    kind: FeedRecommendationFeedbackKind,
  ) => void;
  onRefresh: () => void;
  view: FeedRecommendationViewModel | null;
}

const KIND_LABELS: Record<string, string> = {
  learn: "猜你想学",
  read: "猜你想看",
};

export function FeedWorkspaceView({
  busyId,
  isLoading,
  message,
  onFeedback,
  onRefresh,
  view,
}: FeedWorkspaceViewProps) {
  const items = view?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-raised)] p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--color-ink)]">
            为你推荐 {items.length} 条
          </div>
          <div className="mt-1 truncate text-xs text-[var(--color-muted)]">
            {isLoading ? "读取中" : message}
          </div>
        </div>
        <button
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] disabled:opacity-50"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          刷新
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-raised)] p-5 text-sm text-[var(--color-muted)]">
          {view?.emptyReason ?? "暂无快照数据，刷新后生成推荐"}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-raised)] p-4"
              key={item.id}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-[var(--color-accent)]">
                  {KIND_LABELS[item.kind] ?? item.kind}
                </div>
                <div className="mt-1 text-base font-semibold text-[var(--color-ink)]">
                  {item.topic}
                </div>
                <div className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                  {item.reason}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] disabled:opacity-50"
                  disabled={isLoading || busyId === item.id}
                  onClick={() => onFeedback(item, "click")}
                  type="button"
                >
                  看过了
                </button>
                <button
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] disabled:opacity-50"
                  disabled={isLoading || busyId === item.id}
                  onClick={() => onFeedback(item, "skip")}
                  type="button"
                >
                  不感兴趣
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
