import type { EvidenceTimelineItem } from "@/features/evidence";
import type { LearningLoopStatus } from "@/features/events";
import type { PortraitTimelineItem } from "@/features/portrait";
import type { LearningDashboardSummary } from "./index";

export interface DashboardWorkspaceViewProps {
  evidence: EvidenceTimelineItem[];
  isLoading: boolean;
  message: string;
  onRefresh: () => void;
  portraits: PortraitTimelineItem[];
  status: LearningLoopStatus | null;
  summary: LearningDashboardSummary;
}

const TRIGGER_REASON_LABELS: Record<string, string> = {
  no_evidence: "无未消费证据",
  first_portrait: "首次建档",
  contradiction_signal: "矛盾信号",
  evidence_count: "证据数量",
  strong_recommendation_feedback: "推荐强反馈",
  low_quiz_score: "低测验得分",
};

function triggerSummary(status: LearningLoopStatus | null): string {
  if (!status) {
    return "未读取";
  }
  const label = TRIGGER_REASON_LABELS[status.trigger.reason] ?? status.trigger.reason;
  return status.trigger.shouldRun ? `会触发 · ${label}` : `未触发 · ${label}`;
}

function confidenceLabel(value: number | null): string {
  return value === null ? "-" : value.toFixed(2);
}

export function DashboardWorkspaceView({
  evidence,
  isLoading,
  message,
  onRefresh,
  portraits,
  status,
  summary,
}: DashboardWorkspaceViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">资料</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.totalResources}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            已读 {summary.doneResources} · 稍后 {summary.laterResources}
          </div>
        </div>
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">证据</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.evidenceCount}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            待消费 {summary.pendingEvidenceCount} · 已消费 {summary.consumedEvidenceCount}
          </div>
        </div>
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">画像</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.latestPortraitVersion ?? "-"}
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            可信度 {confidenceLabel(summary.latestPortraitConfidence)}
          </div>
        </div>
        <div className="rounded-md border border-[var(--color-border)] bg-white p-3">
          <div className="text-xs text-[var(--color-muted)]">停留</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">
            {summary.doneDwellSeconds}s
          </div>
          <div className="mt-1 text-xs text-[var(--color-muted)]">
            最近活动 {summary.lastActivityAt ?? "-"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-md border border-[var(--color-border)] bg-white p-4">
        <div className="space-y-1 text-sm">
          <div className="font-medium text-[var(--color-ink)]">
            {status?.portraitVersion == null
              ? "尚未建档"
              : `画像 v${status.portraitVersion} · 可信度 ${confidenceLabel(status.portraitConfidence)}`}
          </div>
          <div className="text-[var(--color-muted)]">
            未消费证据 {status?.unconsumedEvidenceCount ?? "-"} · {triggerSummary(status)}
          </div>
          <div className="text-[var(--color-muted)]">
            状态 {isLoading ? "读取中" : message}
          </div>
        </div>
        <button
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] disabled:opacity-50"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          刷新
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <section className="rounded-md border border-[var(--color-border)] bg-white">
          <div className="border-b border-[var(--color-border)] px-4 py-3 text-sm font-medium">
            证据流
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {evidence.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[var(--color-muted)]">暂无证据</div>
            ) : (
              evidence.map((item) => (
                <div className="px-4 py-3 text-sm" key={`${item.id ?? "new"}-${item.createdAt}`}>
                  <div className="font-medium text-[var(--color-ink)]">
                    #{item.id ?? "-"} {item.type}
                  </div>
                  <div className="mt-1 text-[var(--color-muted)]">{item.summary}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">
                    {item.status === "consumed"
                      ? `已消费到 v${item.consumedInVersion}`
                      : "未消费"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-[var(--color-border)] bg-white">
          <div className="border-b border-[var(--color-border)] px-4 py-3 text-sm font-medium">
            画像演化
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {portraits.length === 0 ? (
              <div className="px-4 py-4 text-sm text-[var(--color-muted)]">暂无版本</div>
            ) : (
              portraits.map((item) => (
                <div className="px-4 py-3 text-sm" key={item.id}>
                  <div className="font-medium text-[var(--color-ink)]">
                    v{item.version} · 可信度 {item.confidence.toFixed(2)}
                  </div>
                  <div className="mt-1 text-[var(--color-muted)]">
                    {item.changeSummary ?? "无变更摘要"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">
                    维度数 {item.dimensionCount}
                    {item.nextFocus ? ` · 下一步 ${item.nextFocus}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
