import type { LearningLoopStatus } from "@/features/events";
import type { PortraitTimelineItem } from "./index";

export interface PortraitStatusPanelProps {
  status: LearningLoopStatus | null;
  timeline: PortraitTimelineItem[];
  isLoading: boolean;
  message: string;
  onRefresh: () => void;
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

function portraitSummary(status: LearningLoopStatus | null): string {
  if (status?.portraitVersion == null) {
    return "尚未建档";
  }
  return `v${status.portraitVersion} · 可信度 ${
    status.portraitConfidence?.toFixed(2) ?? "-"
  }`;
}

export function PortraitStatusPanel({
  status,
  timeline,
  isLoading,
  message,
  onRefresh,
}: PortraitStatusPanelProps) {
  return (
    <>
      <div className="mt-5 text-sm font-medium">画像状态</div>
      <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        <div>{portraitSummary(status)}</div>
        <div>未消费证据：{status?.unconsumedEvidenceCount ?? "-"}</div>
        <div>触发判断：{triggerSummary(status)}</div>
        <div>状态：{isLoading ? "读取中" : message}</div>
        <div>变更：{status?.changeSummary ?? "无"}</div>
        <button
          className="mt-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] disabled:opacity-50"
          disabled={isLoading}
          onClick={onRefresh}
          type="button"
        >
          刷新画像状态
        </button>
      </div>

      <div className="mt-5 text-sm font-medium">版本演化</div>
      <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        {timeline.length === 0 ? (
          <div>暂无版本</div>
        ) : (
          timeline.map((item) => (
            <div
              className="border-b border-[var(--color-border)] pb-2 last:border-b-0 last:pb-0"
              key={item.id}
            >
              <div className="font-medium text-[var(--color-ink)]">
                v{item.version} · 可信度 {item.confidence.toFixed(2)}
              </div>
              <div>{item.changeSummary ?? "无变更摘要"}</div>
              <div>维度数：{item.dimensionCount}</div>
              {item.nextFocus ? <div>下一步：{item.nextFocus}</div> : null}
            </div>
          ))
        )}
      </div>
    </>
  );
}
