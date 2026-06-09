import type { LearningDashboardSummary } from "./index";

export interface DashboardSummaryPanelProps {
  summary: LearningDashboardSummary;
}

export function DashboardSummaryPanel({
  summary,
}: DashboardSummaryPanelProps) {
  return (
    <>
      <div className="mt-5 text-sm font-medium">看板摘要</div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        <div>资料：{summary.totalResources}</div>
        <div>已读：{summary.doneResources}</div>
        <div>稍后：{summary.laterResources}</div>
        <div>停留：{summary.doneDwellSeconds}s</div>
        <div>证据：{summary.evidenceCount}</div>
        <div>待消费：{summary.pendingEvidenceCount}</div>
        <div>画像：{summary.latestPortraitVersion ?? "-"}</div>
        <div>可信度：{summary.latestPortraitConfidence?.toFixed(2) ?? "-"}</div>
      </div>
    </>
  );
}
