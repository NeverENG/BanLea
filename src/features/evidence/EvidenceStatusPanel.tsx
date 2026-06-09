import type { LearningEventResult } from "@/features/events";
import type { Evidence } from "@/types/evidence";
import type { EvidenceTimelineItem } from "./index";

export interface EvidenceStatusPanelProps {
  lastEvidence: Evidence | null;
  lastResult: LearningEventResult | null;
  timeline: EvidenceTimelineItem[];
}

function eventSummary(evidence: Evidence | null): string {
  if (!evidence) {
    return "尚未记录";
  }
  return `#${evidence.id ?? "-"} ${evidence.type} · ${evidence.summary}`;
}

function loopSummary(result: LearningEventResult | null): string {
  if (!result) {
    return "未运行";
  }
  if (result.update.status === "updated") {
    return `已更新画像 v${result.update.portrait.portraitVersion}`;
  }
  if (result.update.status === "deferred") {
    return "已记录证据，等待 API Key 初始化后更新画像";
  }
  return "已记录证据，触发条件未满足，继续积累";
}

export function EvidenceStatusPanel({
  lastEvidence,
  lastResult,
  timeline,
}: EvidenceStatusPanelProps) {
  return (
    <>
      <div className="mt-5 text-sm font-medium">最近证据</div>
      <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        {eventSummary(lastEvidence)}
      </div>

      <div className="mt-5 text-sm font-medium">证据消费</div>
      <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        {timeline.length === 0 ? (
          <div>暂无证据</div>
        ) : (
          timeline.map((item) => (
            <div
              className="border-b border-[var(--color-border)] pb-2 last:border-b-0 last:pb-0"
              key={`${item.id ?? "new"}-${item.createdAt}`}
            >
              <div className="font-medium text-[var(--color-ink)]">
                #{item.id ?? "-"} {item.type}
              </div>
              <div>{item.summary}</div>
              <div>
                {item.status === "consumed"
                  ? `已消费到 v${item.consumedInVersion}`
                  : "未消费"}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 text-sm font-medium">闭环状态</div>
      <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
        {loopSummary(lastResult)}
      </div>
    </>
  );
}
