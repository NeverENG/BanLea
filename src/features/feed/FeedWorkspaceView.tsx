import type { FeedRecommendationViewModel } from "./index";

export interface FeedWorkspaceViewProps {
  isLoading: boolean;
  message: string;
  onRefresh: () => void;
  view: FeedRecommendationViewModel | null;
}

const KIND_LABELS: Record<string, string> = {
  learn: "猜你想学",
  read: "猜你想看",
};

function featureSummary(features: FeedRecommendationViewModel["items"][number]["features"]) {
  const entries = Object.entries(features)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .sort(([, left], [, right]) => Number(right) - Number(left))
    .slice(0, 3);

  if (entries.length === 0) {
    return "暂无特征";
  }

  return entries
    .map(([key, value]) => `${key} ${Number(value).toFixed(2)}`)
    .join(" · ");
}

export function FeedWorkspaceView({
  isLoading,
  message,
  onRefresh,
  view,
}: FeedWorkspaceViewProps) {
  const items = view?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">候选</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {items.length}
          </div>
        </div>
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">主题种子</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {view?.sourceCounts.topicSeeds ?? 0}
          </div>
        </div>
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">书单种子</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {view?.sourceCounts.readingSeeds ?? 0}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-white p-3 text-sm text-[var(--color-muted)]">
        <div>{isLoading ? "读取中" : message}</div>
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
        <div className="mt-4 rounded-md border border-[var(--color-border)] bg-white p-5 text-sm text-[var(--color-muted)]">
          {view?.emptyReason ?? "暂无快照数据，刷新后生成推荐"}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article
              className="rounded-md border border-[var(--color-border)] bg-white p-4"
              key={item.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[var(--color-accent)]">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </div>
                  <div className="mt-1 truncate text-base font-semibold text-[var(--color-ink)]">
                    {item.topic}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                    {item.reason}
                  </div>
                </div>
                <div className="shrink-0 rounded-md bg-[var(--color-soft)] px-2 py-1 text-xs text-[var(--color-muted)]">
                  {item.score.toFixed(2)}
                </div>
              </div>
              <div className="mt-3 text-xs text-[var(--color-muted)]">
                {featureSummary(item.features)}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
