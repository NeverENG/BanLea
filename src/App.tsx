import { useEffect, useMemo, useState } from "react";
import {
  getEvidenceRepository,
  getPortraitRepository,
  getRankerWeightRepository,
  getReadingListRepository,
  getTutorSessionRepository,
} from "@/db";
import type { EvidenceTimelineItem } from "@/features/evidence";
import { EvidenceStatusPanel } from "@/features/evidence/EvidenceStatusPanel";
import {
  type DomainLearningSnapshot,
  type LearningDashboardSummary,
} from "@/features/dashboard";
import { DashboardSummaryPanel } from "@/features/dashboard/DashboardSummaryPanel";
import { DashboardWorkspaceView } from "@/features/dashboard/DashboardWorkspaceView";
import { loadRuntimeDomainLearningSnapshot } from "@/features/dashboard/runtimeSnapshot";
import {
  createLearningEventService,
  type LearningEventResult,
  type LearningEventService,
  type LearningLoopStatus,
} from "@/features/events";
import {
  buildFeedRecommendationView,
  recordFeedRecommendationFeedback,
  type FeedRecommendationFeedbackKind,
  type FeedRecommendationItem,
} from "@/features/feed";
import { FeedWorkspaceView } from "@/features/feed/FeedWorkspaceView";
import {
  createApiKeySettingsService,
  type ApiKeyStatus,
} from "@/features/settings/apiKeySettings";
import type { PortraitTimelineItem } from "@/features/portrait";
import { PortraitStatusPanel } from "@/features/portrait/PortraitStatusPanel";
import { saveTutorTurnMessages } from "@/features/history";
import {
  addTutorResourceSuggestions,
  changeReadingListItemStatus,
  type ReadingListGroup,
  type ReadingListSummary,
  type ReadingListViewItem,
} from "@/features/reading-list";
import { ReadingListPanel } from "@/features/reading-list/ReadingListPanel";
import { ReadingListWorkspaceView } from "@/features/reading-list/ReadingListWorkspaceView";
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
type WorkspaceView = "tutor" | "reading" | "dashboard" | "feed";

const EVENT_OPTIONS: { kind: EventKind; label: string }[] = [
  { kind: "chat", label: "对话" },
  { kind: "self_report", label: "自评" },
  { kind: "quiz", label: "测验" },
  { kind: "reading", label: "阅读" },
  { kind: "reco_click", label: "点击" },
  { kind: "reco_skip", label: "跳过" },
];

const WORKSPACE_VIEW_OPTIONS: { view: WorkspaceView; label: string }[] = [
  { view: "tutor", label: "辅导" },
  { view: "reading", label: "书单" },
  { view: "dashboard", label: "看板" },
  { view: "feed", label: "推荐" },
];

const WORKSPACE_VIEW_META: Record<WorkspaceView, { eyebrow: string; title: string }> = {
  tutor: { eyebrow: "M3 提问式辅导", title: "提问式辅导" },
  reading: { eyebrow: "M4 书单与看板", title: "书单与学习状态" },
  dashboard: { eyebrow: "M4 学习看板", title: "学习状态看板" },
  feed: { eyebrow: "M5 推荐引擎", title: "猜你想学 / 猜你想看" },
};

const EMPTY_READING_SUMMARY: ReadingListSummary = {
  total: 0,
  byStatus: {
    todo: 0,
    reading: 0,
    done: 0,
    later: 0,
  },
  doneDwellSeconds: 0,
};

const EMPTY_DASHBOARD_SUMMARY: LearningDashboardSummary = {
  totalResources: 0,
  doneResources: 0,
  laterResources: 0,
  doneDwellSeconds: 0,
  evidenceCount: 0,
  pendingEvidenceCount: 0,
  consumedEvidenceCount: 0,
  latestPortraitVersion: null,
  latestPortraitConfidence: null,
  portraitVersionCount: 0,
  lastActivityAt: null,
};

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
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("tutor");
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
  const [domainSnapshot, setDomainSnapshot] = useState<DomainLearningSnapshot | null>(
    null,
  );
  const [loopStatus, setLoopStatus] = useState<LearningLoopStatus | null>(null);
  const [loopStatusMessage, setLoopStatusMessage] = useState("未读取");
  const [isLoopStatusLoading, setIsLoopStatusLoading] = useState(false);
  const [portraitTimeline, setPortraitTimeline] = useState<PortraitTimelineItem[]>([]);
  const [evidenceTimeline, setEvidenceTimeline] = useState<EvidenceTimelineItem[]>([]);
  const [readingListItems, setReadingListItems] = useState<ReadingListViewItem[]>([]);
  const [readingListGroups, setReadingListGroups] = useState<ReadingListGroup[]>([]);
  const [readingListSummary, setReadingListSummary] = useState<ReadingListSummary>(
    EMPTY_READING_SUMMARY,
  );
  const [dashboardSummary, setDashboardSummary] = useState<LearningDashboardSummary>(
    EMPTY_DASHBOARD_SUMMARY,
  );
  const [readingListBusyId, setReadingListBusyId] = useState<number | null>(null);
  const [readingListMessage, setReadingListMessage] = useState("未操作");
  const [feedBusyId, setFeedBusyId] = useState<string | null>(null);
  const [feedMessage, setFeedMessage] = useState("未反馈");
  const [checkQuestion, setCheckQuestion] = useState<TutorCheckQuestion | null>(null);
  const [isCheckSaving, setIsCheckSaving] = useState(false);

  const apiKeyService = useMemo(() => createApiKeySettingsService(), []);

  const selectedLabel = useMemo(
    () => EVENT_OPTIONS.find((option) => option.kind === kind)?.label ?? kind,
    [kind],
  );

  const feedRecommendationView = useMemo(
    () =>
      domainSnapshot
        ? buildFeedRecommendationView({
            snapshot: domainSnapshot,
          })
        : null,
    [domainSnapshot],
  );

  function applyDomainLearningSnapshot(snapshot: DomainLearningSnapshot) {
    setDomainSnapshot(snapshot);
    setLoopStatus(snapshot.status);
    setPortraitTimeline(snapshot.portraitTimeline);
    setEvidenceTimeline(snapshot.evidenceTimeline);
    setReadingListItems(snapshot.readingList.items);
    setReadingListGroups(snapshot.readingList.groups);
    setReadingListSummary(snapshot.readingList.summary);
    setDashboardSummary(snapshot.dashboard);
    setTutorMessages(snapshot.tutorHistory.messages);
    setTutorSessionId(snapshot.tutorHistory.session?.id ?? null);
  }

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
    loadRuntimeDomainLearningSnapshot(domain)
      .then((next) => {
        if (!cancelled) {
          applyDomainLearningSnapshot(next);
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

  async function refreshLoopStatus(targetDomain = domain) {
    setIsLoopStatusLoading(true);
    setLoopStatusMessage("读取中");
    try {
      const next = await loadRuntimeDomainLearningSnapshot(targetDomain);
      applyDomainLearningSnapshot(next);
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

  async function recordFeedFeedback(
    item: FeedRecommendationItem,
    feedbackKind: FeedRecommendationFeedbackKind,
  ) {
    setFeedBusyId(item.id);
    setFeedMessage(feedbackKind === "click" ? "记录点击中" : "记录跳过中");
    try {
      const [learningEvents, rankerWeights] = await Promise.all([
        createRuntimeLearningService(),
        getRankerWeightRepository(),
      ]);
      const result = await recordFeedRecommendationFeedback({
        domain,
        item,
        kind: feedbackKind,
        learningEvents,
        rankerWeights,
        dwellSeconds: feedbackKind === "click" ? dwellSeconds : undefined,
      });
      setLastEvidence(result.learning.evidence);
      setLastResult(result.learning);
      setFeedMessage(feedbackKind === "click" ? "已记录点击" : "已记录跳过");
      await refreshLoopStatus(domain);
    } catch (error) {
      setFeedMessage(error instanceof Error ? error.message : "记录反馈失败");
    } finally {
      setFeedBusyId(null);
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
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
            <div>
              <div className="text-sm text-[var(--color-muted)]">
                {WORKSPACE_VIEW_META[workspaceView].eyebrow}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {WORKSPACE_VIEW_META[workspaceView].title}
              </h1>
            </div>
            <div className="flex rounded-md bg-[var(--color-soft)] p-1">
              {WORKSPACE_VIEW_OPTIONS.map((option) => (
                <button
                  className={`rounded px-3 py-1.5 text-sm ${
                    workspaceView === option.view
                      ? "bg-white text-[var(--color-ink)] shadow-sm"
                      : "text-[var(--color-muted)]"
                  }`}
                  key={option.view}
                  onClick={() => setWorkspaceView(option.view)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {workspaceView === "tutor" ? (
            <>
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
            </>
          ) : workspaceView === "reading" ? (
            <ReadingListWorkspaceView
              busyId={readingListBusyId}
              groups={readingListGroups}
              isLoading={isLoopStatusLoading}
              items={readingListItems}
              message={readingListMessage}
              onChangeStatus={changeReadingStatus}
              onRefresh={() => refreshLoopStatus()}
              summary={readingListSummary}
            />
          ) : workspaceView === "dashboard" ? (
            <DashboardWorkspaceView
              evidence={evidenceTimeline}
              isLoading={isLoopStatusLoading}
              message={loopStatusMessage}
              onRefresh={() => refreshLoopStatus()}
              portraits={portraitTimeline}
              status={loopStatus}
              summary={dashboardSummary}
            />
          ) : (
            <FeedWorkspaceView
              busyId={feedBusyId}
              isLoading={isLoopStatusLoading}
              message={feedMessage}
              onFeedback={recordFeedFeedback}
              onRefresh={() => refreshLoopStatus()}
              view={feedRecommendationView}
            />
          )}
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

          <DashboardSummaryPanel summary={dashboardSummary} />

          <ReadingListPanel
            busyId={readingListBusyId}
            groups={readingListGroups}
            items={readingListItems}
            message={readingListMessage}
            onChangeStatus={changeReadingStatus}
            summary={readingListSummary}
          />

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

          <EvidenceStatusPanel
            lastEvidence={lastEvidence}
            lastResult={lastResult}
            timeline={evidenceTimeline}
          />

          <PortraitStatusPanel
            isLoading={isLoopStatusLoading}
            message={loopStatusMessage}
            onRefresh={() => refreshLoopStatus()}
            status={loopStatus}
            timeline={portraitTimeline}
          />
        </aside>
      </main>
    </div>
  );
}
