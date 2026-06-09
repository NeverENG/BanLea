import { useMemo, useState } from "react";
import { getEvidenceRepository, getPortraitRepository } from "@/db";
import { createLearningEventService, type LearningEventResult } from "@/features/events";
import type { Evidence } from "@/types/evidence";

type EventKind = "chat" | "self_report" | "quiz" | "reading" | "reco_click" | "reco_skip";

const EVENT_OPTIONS: { kind: EventKind; label: string }[] = [
  { kind: "chat", label: "对话" },
  { kind: "self_report", label: "自评" },
  { kind: "quiz", label: "测验" },
  { kind: "reading", label: "阅读" },
  { kind: "reco_click", label: "点击" },
  { kind: "reco_skip", label: "跳过" },
];

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

export default function App() {
  const [domain, setDomain] = useState("computer_science");
  const [kind, setKind] = useState<EventKind>("chat");
  const [content, setContent] = useState("帮我入门 k8s");
  const [score, setScore] = useState(0.6);
  const [dwellSeconds, setDwellSeconds] = useState(60);
  const [lastEvidence, setLastEvidence] = useState<Evidence | null>(null);
  const [lastResult, setLastResult] = useState<LearningEventResult | null>(null);
  const [status, setStatus] = useState("等待记录");
  const [isSaving, setIsSaving] = useState(false);

  const selectedLabel = useMemo(
    () => EVENT_OPTIONS.find((option) => option.kind === kind)?.label ?? kind,
    [kind],
  );

  async function recordEvent() {
    setIsSaving(true);
    setStatus("写入中");
    try {
      const [evidenceRepository, portraitRepository] = await Promise.all([
        getEvidenceRepository(),
        getPortraitRepository(),
      ]);
      const service = createLearningEventService({
        repositories: {
          evidence: evidenceRepository,
          portraits: portraitRepository,
        },
      });
      let result: LearningEventResult;

      switch (kind) {
        case "chat":
          result = await service.recordChat({
            domain,
            role: "user",
            content,
          });
          break;
        case "self_report":
          result = await service.recordSelfReport({
            domain: domain === "global" ? "global" : domain,
            statement: content,
          });
          break;
        case "quiz":
          result = await service.recordQuiz({
            domain,
            topic: content,
            score,
          });
          break;
        case "reading":
          result = await service.recordReading({
            domain,
            title: content,
            status: "done",
            dwellSeconds,
          });
          break;
        case "reco_click":
          result = await service.recordRecommendationClick({
            domain,
            topic: content,
            dwellSeconds,
          });
          break;
        case "reco_skip":
          result = await service.recordRecommendationSkip({
            domain,
            topic: content,
          });
          break;
      }

      setLastEvidence(result.evidence);
      setLastResult(result);
      setStatus("已写入 evidence");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "写入失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)]">
      <main className="mx-auto grid min-h-screen max-w-6xl grid-cols-[260px_minmax(0,1fr)_280px] gap-4 px-6 py-5">
        <aside className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-xl font-semibold tracking-tight">BanLea</div>
          <div className="mt-5 space-y-2">
            {["computer_science", "physics", "global"].map((item) => (
              <button
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  domain === item
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                }`}
                key={item}
                onClick={() => setDomain(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <div className="text-sm text-[var(--color-muted)]">M2 自迭代闭环</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">事件采集</h1>
          </div>

          <div className="flex-1 space-y-5 p-5">
            <div className="grid grid-cols-6 gap-2">
              {EVENT_OPTIONS.map((option) => (
                <button
                  className={`rounded-md border px-3 py-2 text-sm ${
                    kind === option.kind
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                  }`}
                  key={option.kind}
                  onClick={() => setKind(option.kind)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className="block text-sm font-medium">
              内容
              <textarea
                className="mt-2 min-h-32 w-full resize-none rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                onChange={(event) => setContent(event.target.value)}
                value={content}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                测验得分
                <input
                  className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  max="1"
                  min="0"
                  onChange={(event) => setScore(Number(event.target.value))}
                  step="0.05"
                  type="number"
                  value={score}
                />
              </label>
              <label className="text-sm font-medium">
                停留秒数
                <input
                  className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  min="0"
                  onChange={(event) => setDwellSeconds(Number(event.target.value))}
                  type="number"
                  value={dwellSeconds}
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-4">
            <div className="text-sm text-[var(--color-muted)]">{selectedLabel} · {domain}</div>
            <button
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={isSaving}
              onClick={recordEvent}
              type="button"
            >
              {isSaving ? "写入中" : "记录"}
            </button>
          </div>
        </section>

        <aside className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="text-sm font-medium">状态</div>
          <div className="mt-3 rounded-md bg-[var(--color-soft)] p-3 text-sm text-[var(--color-muted)]">
            {status}
          </div>

          <div className="mt-5 text-sm font-medium">最近证据</div>
          <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {eventSummary(lastEvidence)}
          </div>

          <div className="mt-5 text-sm font-medium">闭环状态</div>
          <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {loopSummary(lastResult)}
          </div>
        </aside>
      </main>
    </div>
  );
}
