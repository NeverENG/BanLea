import { useState } from "react";
import type { LearningLoopStatus } from "@/features/events";
import {
  buildPortraitDimensionTrendItems,
  buildPortraitDimensionVisualItems,
  buildPortraitRadarModel,
  type PortraitDimensionVisualItem,
  type PortraitTimelineItem,
} from "./index";

export interface PortraitRevisionRequest {
  dimension: PortraitDimensionVisualItem;
  request: string;
}

export interface PortraitStatusPanelProps {
  status: LearningLoopStatus | null;
  timeline: PortraitTimelineItem[];
  isLoading: boolean;
  message: string;
  onRefresh: () => void;
  onRequestRevision: (request: PortraitRevisionRequest) => void;
  revisionBusy: boolean;
  revisionMessage: string;
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

function formatDelta(delta: number | null): string {
  if (delta === null) {
    return "-";
  }
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}`;
}

export function PortraitStatusPanel({
  status,
  timeline,
  isLoading,
  message,
  onRefresh,
  onRequestRevision,
  revisionBusy,
  revisionMessage,
}: PortraitStatusPanelProps) {
  const [selectedDimensionKey, setSelectedDimensionKey] = useState("");
  const [revisionRequest, setRevisionRequest] = useState("");
  const dimensions = buildPortraitDimensionVisualItems(
    status?.latest?.portrait ?? null,
    { limit: 6 },
  );
  const radar = buildPortraitRadarModel(dimensions.slice(0, 6), 176);
  const trends = buildPortraitDimensionTrendItems(timeline, { limit: 4 });
  const selectedDimension =
    dimensions.find((item) => item.key === selectedDimensionKey) ??
    dimensions[0] ??
    null;
  const selectedKey = selectedDimension?.key ?? "";

  function submitRevisionRequest() {
    if (!selectedDimension || !revisionRequest.trim()) {
      return;
    }
    onRequestRevision({
      dimension: selectedDimension,
      request: revisionRequest,
    });
    setRevisionRequest("");
  }

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

      <div className="mt-5 text-sm font-medium">维度概览</div>
      <div className="mt-3 space-y-3 rounded-md border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
        {radar.points.length >= 3 ? (
          <svg
            aria-label="画像雷达图"
            className="mx-auto mb-2 block"
            height={radar.size}
            role="img"
            viewBox={`0 0 ${radar.size} ${radar.size}`}
            width={radar.size}
          >
            {[0.33, 0.66, 1].map((scale) => (
              <circle
                className="fill-none stroke-[var(--color-border)]"
                cx={radar.center}
                cy={radar.center}
                key={scale}
                r={radar.radius * scale}
              />
            ))}
            {radar.points.map((point) => (
              <line
                className="stroke-[var(--color-border)]"
                key={`${point.key}-axis`}
                x1={radar.center}
                x2={point.axisX}
                y1={radar.center}
                y2={point.axisY}
              />
            ))}
            <polygon
              className="fill-[var(--color-accent)] opacity-20 stroke-[var(--color-accent)]"
              points={radar.polygonPoints}
            />
            {radar.points.map((point) => (
              <circle
                className="fill-[var(--color-accent)]"
                cx={point.x}
                cy={point.y}
                key={`${point.key}-point`}
                r="3"
              />
            ))}
          </svg>
        ) : null}
        {dimensions.length === 0 ? (
          <div>暂无维度</div>
        ) : (
          dimensions.map((item) => (
            <div
              className={item.isLowConfidence ? "opacity-60" : undefined}
              key={item.key}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate font-medium text-[var(--color-ink)]">
                  {item.label}
                </div>
                <div className="shrink-0 text-xs">
                  {item.value.toFixed(2)} · {item.confidence.toFixed(2)}
                </div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-soft)]">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${Math.round(item.value * 100)}%` }}
                />
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5">
                {item.summary}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 text-sm font-medium">协商修改</div>
      <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
        <select
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          disabled={dimensions.length === 0 || revisionBusy}
          onChange={(event) => setSelectedDimensionKey(event.target.value)}
          value={selectedKey}
        >
          {dimensions.length === 0 ? (
            <option value="">暂无维度</option>
          ) : (
            dimensions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))
          )}
        </select>
        <textarea
          className="mt-3 min-h-20 w-full resize-none rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          disabled={!selectedDimension || revisionBusy}
          onChange={(event) => setRevisionRequest(event.target.value)}
          value={revisionRequest}
        />
        <button
          className="mt-3 w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!selectedDimension || !revisionRequest.trim() || revisionBusy}
          onClick={submitRevisionRequest}
          type="button"
        >
          {revisionBusy ? "提交中" : "提交协商"}
        </button>
        <div className="mt-3 text-xs leading-5">{revisionMessage}</div>
      </div>

      <div className="mt-5 text-sm font-medium">版本趋势</div>
      <div className="mt-3 space-y-3 rounded-md border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
        {trends.length === 0 ? (
          <div>暂无趋势</div>
        ) : (
          trends.map((item) => (
            <div key={item.key}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-[var(--color-ink)]">{item.label}</div>
                <div className="text-xs">{formatDelta(item.delta)}</div>
              </div>
              <div className="mt-2 flex h-8 items-end gap-1">
                {item.points.map((point) => (
                  <div
                    className="min-w-3 flex-1 rounded-t bg-[var(--color-accent)]"
                    key={`${item.key}-${point.version}`}
                    style={{ height: `${Math.max(8, Math.round(point.value * 32))}px` }}
                    title={`v${point.version} · ${point.value.toFixed(2)}`}
                  />
                ))}
              </div>
            </div>
          ))
        )}
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
