import { useEffect, useMemo, useState } from "react";
import {
  getEvidenceRepository,
  getPortraitRepository,
  getReadingListRepository,
  getTutorSessionRepository,
} from "@/db";
import {
  loadEvidenceTimeline,
  type EvidenceTimelineItem,
} from "@/features/evidence";
import {
  createLearningEventService,
  loadLearningLoopStatus,
  type LearningEventResult,
  type LearningEventService,
  type LearningLoopStatus,
} from "@/features/events";
import {
  createApiKeySettingsService,
  type ApiKeyStatus,
} from "@/features/settings/apiKeySettings";
import {
  loadPortraitTimeline,
  type PortraitTimelineItem,
} from "@/features/portrait";
import {
  loadLatestTutorHistory,
  saveTutorTurnMessages,
  type TutorHistorySnapshot,
} from "@/features/history";
import {
  addTutorResourceSuggestions,
  changeReadingListItemStatus,
  loadReadingList,
  type ReadingListViewItem,
} from "@/features/reading-list";
import {
  createLocalTutorCheckQuestion,
  createLocalTutorResourceSuggestions,
  createTutorInputService,
  loadTutorPromptContext,
  type TutorCheckQuestion,
  type TutorMessage,
} from "@/features/tutor";
import type { Evidence } from "@/types/evidence";
import type {
  HarnessRunRepositories,
  TriggeredHarnessUpdateResult,
} from "@/core/harness";
import type { ReadingListStatus } from "@/types/readingList";

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

const TRIGGER_REASON_LABELS: Record<string, string> = {
  no_evidence: "无未消费证据",
  first_portrait: "首次建档",
  contradiction_signal: "矛盾信号",
  evidence_count: "证据数量",
  strong_recommendation_feedback: "推荐强反馈",
  low_quiz_score: "低测验得分",
};

const READING_STATUS_ACTIONS: { status: ReadingListStatus; label: string }[] = [
  { status: "done", label: "已读" },
  { status: "later", label: "稍后" },
];

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
  return `v${status.portraitVersion} · 可信度 ${status.portraitConfidence?.toFixed(2) ?? "-"}`;
}

function scopeForDomain(domain: string): "global" | "domain" {
  return domain === "global" ? "global" : "domain";
}

async function runLiveHarnessUpdate(
  evidence: Evidence,
  repositories: HarnessRunRepositories,
): Promise<TriggeredHarnessUpdateResult> {
  const { runHarnessUpdateIfTriggered } = await import("@/core/harness");
  return runHarnessUpdateIfTriggered({
    scope: scopeForDomain(evidence.domain),
    domain: evidence.domain,
    repositories,
  });
}

export default function App() {
  const [domain, setDomain] = useState("computer_science");
  const [kind, setKind] = useState<EventKind>("chat");
  const [content, setContent] = useState("帮我入门 k8s");
  const [tutorInput, setTutorInput] = useState("帮我入门 k8s");
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [tutorSessionId, setTutorSessionId] = useState<number | null>(null);
  const [score, setScore] = useState(0.6);
  const [dwellSeconds, setDwellSeconds] = useState(60);
  const [lastEvidence, setLastEvidence] = useState<Evidence | null>(null);
  const [lastResult, setLastResult] = useState<LearningEventResult | null>(null);
  const [status, setStatus] = useState("等待记录");
  const [isSaving, setIsSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    configured: false,
    maskedKey: null,
  });
  const [apiKeyMessage, setApiKeyMessage] = useState("未设置");
  const [isKeyBusy, setIsKeyBusy] = useState(false);
  const [isClaudeReady, setIsClaudeReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loopStatus, setLoopStatus] = useState<LearningLoopStatus | null>(null);
  const [loopStatusMessage, setLoopStatusMessage] = useState("未读取");
  const [isLoopStatusLoading, setIsLoopStatusLoading] = useState(false);
  const [portraitTimeline, setPortraitTimeline] = useState<PortraitTimelineItem[]>([]);
  const [evidenceTimeline, setEvidenceTimeline] = useState<EvidenceTimelineItem[]>([]);
  const [readingListItems, setReadingListItems] = useState<ReadingListViewItem[]>([]);
  const [readingListBusyId, setReadingListBusyId] = useState<number | null>(null);
  const [readingListMessage, setReadingListMessage] = useState("未操作");
  const [checkQuestion, setCheckQuestion] = useState<TutorCheckQuestion | null>(null);
  const [isCheckSaving, setIsCheckSaving] = useState(false);

  const apiKeyService = useMemo(() => createApiKeySettingsService(), []);

  const selectedLabel = useMemo(
    () => EVENT_OPTIONS.find((option) => option.kind === kind)?.label ?? kind,
    [kind],
  );

  useEffect(() => {
    let cancelled = false;
    setIsKeyBusy(true);
    apiKeyService
      .initializeSavedKey()
      .then((next) => {
        if (!cancelled) {
          setApiKeyStatus({
            configured: next.configured,
            maskedKey: next.maskedKey,
          });
          setIsClaudeReady(next.clientInitialized);
          setApiKeyMessage(next.clientInitialized ? "已初始化" : "未设置");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setApiKeyMessage(error instanceof Error ? error.message : "读取失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsKeyBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiKeyService]);

  useEffect(() => {
    let cancelled = false;
    setIsLoopStatusLoading(true);
    loadDomainLoopSnapshot(domain)
      .then((next) => {
        if (!cancelled) {
          setLoopStatus(next.status);
          setPortraitTimeline(next.timeline);
          setEvidenceTimeline(next.evidence);
          setReadingListItems(next.readingList);
          setTutorMessages(next.tutorHistory.messages);
          setTutorSessionId(next.tutorHistory.session?.id ?? null);
          setLoopStatusMessage("已读取");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoopStatusMessage(error instanceof Error ? error.message : "读取失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoopStatusLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  async function saveKey() {
    setIsKeyBusy(true);
    setApiKeyMessage("保存中");
    try {
      await apiKeyService.save(apiKeyInput);
      const next = await apiKeyService.initializeSavedKey();
      setApiKeyStatus({
        configured: next.configured,
        maskedKey: next.maskedKey,
      });
      setIsClaudeReady(next.clientInitialized);
      setApiKeyInput("");
      setApiKeyMessage(next.clientInitialized ? "已保存并初始化" : "已保存");
    } catch (error) {
      setApiKeyMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsKeyBusy(false);
    }
  }

  async function deleteKey() {
    setIsKeyBusy(true);
    setApiKeyMessage("删除中");
    try {
      const next = await apiKeyService.delete();
      setApiKeyStatus(next);
      setIsClaudeReady(false);
      setApiKeyInput("");
      setApiKeyMessage("已删除");
    } catch (error) {
      setApiKeyMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setIsKeyBusy(false);
    }
  }

  async function refreshKeyStatus() {
    setIsKeyBusy(true);
    try {
      const next = await apiKeyService.initializeSavedKey();
      setApiKeyStatus({
        configured: next.configured,
        maskedKey: next.maskedKey,
      });
      setIsClaudeReady(next.clientInitialized);
      setApiKeyMessage(next.clientInitialized ? "已初始化" : "未设置");
    } catch (error) {
      setApiKeyMessage(error instanceof Error ? error.message : "读取失败");
    } finally {
      setIsKeyBusy(false);
    }
  }

  async function createRuntimeLearningService(): Promise<LearningEventService> {
    const [evidenceRepository, portraitRepository] = await Promise.all([
      getEvidenceRepository(),
      getPortraitRepository(),
    ]);
    const repositories = {
      evidence: evidenceRepository,
      portraits: portraitRepository,
    };
    return createLearningEventService({
      repositories,
      updateAfterEvidence: isClaudeReady
        ? (evidence) => runLiveHarnessUpdate(evidence, repositories)
        : undefined,
    });
  }

  async function loadDomainLoopSnapshot(targetDomain: string): Promise<{
    status: LearningLoopStatus;
    timeline: PortraitTimelineItem[];
    evidence: EvidenceTimelineItem[];
    readingList: ReadingListViewItem[];
    tutorHistory: TutorHistorySnapshot;
  }> {
    const [
      evidenceRepository,
      portraitRepository,
      readingListRepository,
      tutorSessionRepository,
    ] = await Promise.all([
      getEvidenceRepository(),
      getPortraitRepository(),
      getReadingListRepository(),
      getTutorSessionRepository(),
    ]);
    const repositories = {
      evidence: evidenceRepository,
      portraits: portraitRepository,
    };
    const [status, timeline, evidence, readingList, tutorHistory] = await Promise.all([
      loadLearningLoopStatus({
        domain: targetDomain,
        repositories,
      }),
      loadPortraitTimeline({
        domain: targetDomain,
        repository: portraitRepository,
      }),
      loadEvidenceTimeline({
        domain: targetDomain,
        repository: evidenceRepository,
      }),
      loadReadingList({
        domain: targetDomain,
        repository: readingListRepository,
      }),
      loadLatestTutorHistory({
        domain: targetDomain,
        repository: tutorSessionRepository,
      }),
    ]);
    return { status, timeline, evidence, readingList, tutorHistory };
  }

  async function refreshLoopStatus(targetDomain = domain) {
    setIsLoopStatusLoading(true);
    setLoopStatusMessage("读取中");
    try {
      const next = await loadDomainLoopSnapshot(targetDomain);
      setLoopStatus(next.status);
      setPortraitTimeline(next.timeline);
      setEvidenceTimeline(next.evidence);
      setReadingListItems(next.readingList);
      setTutorMessages(next.tutorHistory.messages);
      setTutorSessionId(next.tutorHistory.session?.id ?? null);
      setLoopStatusMessage("已刷新");
    } catch (error) {
      setLoopStatusMessage(error instanceof Error ? error.message : "读取失败");
    } finally {
      setIsLoopStatusLoading(false);
    }
  }

  async function sendTutorMessage() {
    setIsSending(true);
    setStatus("发送中");
    try {
      const [
        learningEvents,
        portraitRepository,
        readingListRepository,
        tutorSessionRepository,
      ] = await Promise.all([
        createRuntimeLearningService(),
        getPortraitRepository(),
        getReadingListRepository(),
        getTutorSessionRepository(),
      ]);
      const replyGenerator = isClaudeReady
        ? (await import("@/features/tutor/claudeReply")).createClaudeTutorReplyGenerator()
        : undefined;
      const service = createTutorInputService({
        learningEvents,
        promptContextProvider: ({ domain: targetDomain }) =>
          loadTutorPromptContext({
            domain: targetDomain,
            portraits: portraitRepository,
          }),
        replyGenerator,
        resourceSuggestionProvider: createLocalTutorResourceSuggestions,
        checkQuestionProvider: createLocalTutorCheckQuestion,
      });
      const result = await service.sendUserMessage({
        domain,
        content: tutorInput,
      });
      const savedTurn = await saveTutorTurnMessages({
        domain,
        repository: tutorSessionRepository,
        sessionId: tutorSessionId,
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        titleSeed: result.userMessage.content,
      });

      setTutorMessages(savedTurn.messages);
      setTutorSessionId(savedTurn.session.id);
      setTutorInput("");
      setLastEvidence(result.learning.evidence);
      setLastResult(result.learning);
      setCheckQuestion(result.checkQuestion);
      await addTutorResourceSuggestions({
        domain,
        suggestions: result.resourceSuggestions,
        repository: readingListRepository,
        evidenceId: result.learning.evidence.id ?? null,
      });
      setStatus("已发送");
      await refreshLoopStatus(domain);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发送失败");
    } finally {
      setIsSending(false);
    }
  }

  async function recordCheckResult(score: number) {
    if (!checkQuestion) {
      return;
    }
    setIsCheckSaving(true);
    setStatus("记录验证中");
    try {
      const service = await createRuntimeLearningService();
      const result = await service.recordQuiz({
        domain,
        topic: checkQuestion.topic,
        score,
      });
      setLastEvidence(result.evidence);
      setLastResult(result);
      setStatus("已记录验证");
      await refreshLoopStatus(domain);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "记录验证失败");
    } finally {
      setIsCheckSaving(false);
    }
  }

  async function changeReadingStatus(
    item: ReadingListViewItem,
    nextStatus: ReadingListStatus,
  ) {
    if (item.id === null) {
      return;
    }
    setReadingListBusyId(item.id);
    setReadingListMessage("更新中");
    try {
      const [repository, learningEvents] = await Promise.all([
        getReadingListRepository(),
        createRuntimeLearningService(),
      ]);
      const result = await changeReadingListItemStatus({
        id: item.id,
        status: nextStatus,
        repository,
        learningEvents,
      });
      if (result.learning) {
        setLastEvidence(result.learning.evidence);
        setLastResult(result.learning);
      }
      setReadingListMessage("已更新");
      await refreshLoopStatus(domain);
    } catch (error) {
      setReadingListMessage(error instanceof Error ? error.message : "更新失败");
    } finally {
      setReadingListBusyId(null);
    }
  }

  async function recordEvent() {
    setIsSaving(true);
    setStatus("写入中");
    try {
      const service = await createRuntimeLearningService();
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
            confidenceScore: score,
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
      await refreshLoopStatus(domain);
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
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">提问式辅导</h1>
          </div>

          <div className="flex-1 space-y-6 p-5">
            <div className="flex min-h-60 flex-col gap-3 rounded-md border border-[var(--color-border)] bg-white p-4">
              <div className="flex-1 space-y-3">
                {tutorMessages.length === 0 ? (
                  <div className="text-sm text-[var(--color-muted)]">尚无消息</div>
                ) : (
                  tutorMessages.map((message) => (
                    <div
                      className={`max-w-[78%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 ${
                        message.role === "user"
                          ? "ml-auto bg-[var(--color-accent)] text-white"
                          : "mr-auto bg-[var(--color-soft)] text-[var(--color-ink)]"
                      }`}
                      key={message.id}
                    >
                      {message.content}
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <textarea
                  className="min-h-16 flex-1 resize-none rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                  onChange={(event) => setTutorInput(event.target.value)}
                  value={tutorInput}
                />
                <button
                  className="w-20 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={isSending}
                  onClick={sendTutorMessage}
                  type="button"
                >
                  {isSending ? "发送中" : "发送"}
                </button>
              </div>
            </div>

            <div className="border-t border-[var(--color-border)] pt-5">
              <div className="text-sm font-medium">事件采集</div>
              <div className="mt-3 grid grid-cols-6 gap-2">
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
          <div className="text-sm font-medium">API Key</div>
          <div className="mt-3 rounded-md border border-[var(--color-border)] p-3">
            <div className="text-sm text-[var(--color-muted)]">
              {apiKeyStatus.configured ? apiKeyStatus.maskedKey : "未设置"}
              {isClaudeReady ? " · Claude 已初始化" : ""}
            </div>
            <input
              className="mt-3 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="Anthropic API Key"
              type="password"
              value={apiKeyInput}
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={isKeyBusy}
                onClick={saveKey}
                type="button"
              >
                保存
              </button>
              <button
                className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] disabled:opacity-50"
                disabled={isKeyBusy}
                onClick={deleteKey}
                type="button"
              >
                删除
              </button>
              <button
                className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] disabled:opacity-50"
                disabled={isKeyBusy}
                onClick={refreshKeyStatus}
                type="button"
              >
                刷新
              </button>
            </div>
            <div className="mt-3 text-sm text-[var(--color-muted)]">{apiKeyMessage}</div>
          </div>

          <div className="mt-5 text-sm font-medium">状态</div>
          <div className="mt-3 rounded-md bg-[var(--color-soft)] p-3 text-sm text-[var(--color-muted)]">
            {status}
          </div>

          <div className="mt-5 text-sm font-medium">待读书单</div>
          <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {readingListItems.length === 0 ? (
              <div>暂无待读资料</div>
            ) : (
              readingListItems.slice(0, 5).map((item) => (
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
                    {READING_STATUS_ACTIONS.map((action) => (
                      <button
                        className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-50"
                        disabled={
                          item.id === null ||
                          readingListBusyId === item.id ||
                          item.status === action.status
                        }
                        key={action.status}
                        onClick={() => changeReadingStatus(item, action.status)}
                        type="button"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div>{readingListMessage}</div>
          </div>

          <div className="mt-5 text-sm font-medium">本轮验证</div>
          <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {checkQuestion ? (
              <>
                <div className="text-[var(--color-ink)]">{checkQuestion.prompt}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
                    disabled={isCheckSaving}
                    onClick={() => recordCheckResult(0.4)}
                    type="button"
                  >
                    未掌握
                  </button>
                  <button
                    className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={isCheckSaving}
                    onClick={() => recordCheckResult(0.85)}
                    type="button"
                  >
                    已掌握
                  </button>
                </div>
              </>
            ) : (
              <div>暂无验证问题</div>
            )}
          </div>

          <div className="mt-5 text-sm font-medium">最近证据</div>
          <div className="mt-3 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {eventSummary(lastEvidence)}
          </div>

          <div className="mt-5 text-sm font-medium">证据消费</div>
          <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {evidenceTimeline.length === 0 ? (
              <div>暂无证据</div>
            ) : (
              evidenceTimeline.map((item) => (
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

          <div className="mt-5 text-sm font-medium">画像状态</div>
          <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            <div>{portraitSummary(loopStatus)}</div>
            <div>未消费证据：{loopStatus?.unconsumedEvidenceCount ?? "-"}</div>
            <div>触发判断：{triggerSummary(loopStatus)}</div>
            <div>状态：{isLoopStatusLoading ? "读取中" : loopStatusMessage}</div>
            <div>变更：{loopStatus?.changeSummary ?? "无"}</div>
            <button
              className="mt-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] disabled:opacity-50"
              disabled={isLoopStatusLoading}
              onClick={() => refreshLoopStatus()}
              type="button"
            >
              刷新画像状态
            </button>
          </div>

          <div className="mt-5 text-sm font-medium">版本演化</div>
          <div className="mt-3 space-y-2 rounded-md border border-[var(--color-border)] p-3 text-sm leading-6 text-[var(--color-muted)]">
            {portraitTimeline.length === 0 ? (
              <div>暂无版本</div>
            ) : (
              portraitTimeline.map((item) => (
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
        </aside>
      </main>
    </div>
  );
}
