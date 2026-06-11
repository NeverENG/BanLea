import { useEffect, useMemo, useState } from "react";
import { createGitHubResourceSource } from "@/core/sources";
import {
  getEvidenceRepository,
  getOnboardingProfileRepository,
  getPortraitRepository,
  getRankerWeightRepository,
  getRecommendationRepository,
  getReadingListRepository,
  getTutorSessionRepository,
} from "@/db";
import type { EvidenceTimelineItem } from "@/features/evidence";
import {
  type DomainLearningSnapshot,
  type LearningDashboardSummary,
} from "@/features/dashboard";
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
  persistFeedRecommendationView,
  recordFeedRecommendationFeedback,
  type FeedRecommendationFeedbackKind,
  type FeedRecommendationItem,
  type FeedRecommendationViewModel,
} from "@/features/feed";
import { FeedWorkspaceView } from "@/features/feed/FeedWorkspaceView";
import {
  createApiKeySettingsService,
  type ApiKeyStatus,
} from "@/features/settings/apiKeySettings";
import {
  createResourceSourceSettingsService,
  enabledResourceSourceIds,
  type ResourceSourceRuntimeStatus,
} from "@/features/settings/resourceSourceSettings";
import {
  buildOnboardingSeedProfileFromProfile,
  onboardingProfileToStatement,
  ONBOARDING_DIMENSION_HINTS,
  splitOnboardingInterestsInput,
} from "@/features/onboarding";
import {
  recordPortraitRevisionRequest,
  type PortraitTimelineItem,
} from "@/features/portrait";
import {
  PortraitStatusPanel,
  type PortraitRevisionRequest,
} from "@/features/portrait/PortraitStatusPanel";
import { saveTutorTurnMessages } from "@/features/history";
import {
  addTutorResourceSuggestions,
  changeReadingListItemStatus,
  type ReadingListGroup,
  type ReadingListSummary,
  type ReadingListViewItem,
} from "@/features/reading-list";
import { ReadingListWorkspaceView } from "@/features/reading-list/ReadingListWorkspaceView";
import {
  createLocalTutorCheckQuestion,
  createLocalTutorResourceSuggestions,
  createTutorInputService,
  loadTutorPromptContext,
  type TutorCheckQuestion,
  type TutorMessage,
} from "@/features/tutor";
import { createSourceBackedTutorResourceSuggestionProvider } from "@/features/tutor/sourceSuggestions";
import type { Evidence } from "@/types/evidence";
import type {
  HarnessRunRepositories,
  TriggeredHarnessUpdateResult,
} from "@/core/harness";
import type { ReadingListStatus } from "@/types/readingList";
import type { OnboardingProfile } from "@/types/onboarding";

type WorkspaceView = "tutor" | "resources" | "dashboard" | "portrait" | "profile";
type ResourceMode = "reading" | "feed";
type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "banlea-theme";

const WORKSPACE_VIEW_OPTIONS: { view: WorkspaceView; label: string; glyph: string }[] = [
  { view: "tutor", label: "学习", glyph: "学" },
  { view: "resources", label: "资料", glyph: "册" },
  { view: "dashboard", label: "数据", glyph: "迹" },
  { view: "portrait", label: "画像", glyph: "象" },
  { view: "profile", label: "我的", glyph: "吾" },
];

const RESOURCE_MODE_OPTIONS: { mode: ResourceMode; label: string }[] = [
  { mode: "reading", label: "书单" },
  { mode: "feed", label: "推荐" },
];

const DOMAIN_OPTIONS: { value: string; label: string }[] = [
  { value: "computer_science", label: "计算机" },
  { value: "physics", label: "物理" },
  { value: "global", label: "全部" },
];

const WORKSPACE_VIEW_META: Record<WorkspaceView, { eyebrow: string; title: string }> = {
  tutor: { eyebrow: "伴学对话", title: "学习" },
  resources: { eyebrow: "书阁与推荐", title: "资料" },
  dashboard: { eyebrow: "学迹纵览", title: "数据" },
  portrait: { eyebrow: "学习画像", title: "画像" },
  profile: { eyebrow: "个人设置", title: "我的" },
};

const FEED_CLICK_DWELL_SECONDS = 60;

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

function createRuntimeResourceSources(statuses: ResourceSourceRuntimeStatus[]) {
  const enabledIds = new Set(enabledResourceSourceIds(statuses));
  return [
    createGitHubResourceSource({
      enabled: enabledIds.has("github"),
      perPage: 3,
    }),
  ];
}

function scopeForDomain(domain: string): "global" | "domain" {
  return domain === "global" ? "global" : "domain";
}

function domainLabel(domain: string): string {
  return DOMAIN_OPTIONS.find((item) => item.value === domain)?.label ?? domain;
}

function readInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
    ? "dark"
    : "light";
}

function friendlyErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message.includes("Cannot read properties of undefined") &&
    message.includes("invoke")
    ? "桌面端运行时可用，浏览器预览不连接本地存储"
    : message;
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
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [domain, setDomain] = useState("computer_science");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("tutor");
  const [resourceMode, setResourceMode] = useState<ResourceMode>("reading");
  const [tutorInput, setTutorInput] = useState("帮我入门 k8s");
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [tutorSessionId, setTutorSessionId] = useState<number | null>(null);
  const [lastEvidence, setLastEvidence] = useState<Evidence | null>(null);
  const [lastResult, setLastResult] = useState<LearningEventResult | null>(null);
  const [status, setStatus] = useState("等待记录");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    configured: false,
    maskedKey: null,
  });
  const [apiKeyMessage, setApiKeyMessage] = useState("未设置");
  const [isKeyBusy, setIsKeyBusy] = useState(false);
  const [isClaudeReady, setIsClaudeReady] = useState(false);
  const [resourceSourceStatuses, setResourceSourceStatuses] = useState<
    ResourceSourceRuntimeStatus[]
  >([]);
  const [isSending, setIsSending] = useState(false);
  const [onboardingGoal, setOnboardingGoal] = useState("");
  const [onboardingInterests, setOnboardingInterests] = useState("");
  const [onboardingBackground, setOnboardingBackground] = useState("");
  const [onboardingProfile, setOnboardingProfile] =
    useState<OnboardingProfile | null>(null);
  const [onboardingMessage, setOnboardingMessage] = useState("未建档");
  const [isOnboardingSaving, setIsOnboardingSaving] = useState(false);
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
  const [feedRecommendationView, setFeedRecommendationView] =
    useState<FeedRecommendationViewModel | null>(null);
  const [feedMessage, setFeedMessage] = useState("未反馈");
  const [portraitRevisionMessage, setPortraitRevisionMessage] =
    useState("未提交");
  const [isPortraitRevisionSaving, setIsPortraitRevisionSaving] = useState(false);
  const [checkQuestion, setCheckQuestion] = useState<TutorCheckQuestion | null>(null);
  const [isCheckSaving, setIsCheckSaving] = useState(false);

  const apiKeyService = useMemo(() => createApiKeySettingsService(), []);
  const resourceSourceSettingsService = useMemo(
    () => createResourceSourceSettingsService(),
    [],
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
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

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
          setApiKeyMessage(friendlyErrorMessage(error, "读取失败"));
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
    resourceSourceSettingsService
      .loadStatus()
      .then((statuses) => {
        if (!cancelled) {
          setResourceSourceStatuses(statuses);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resourceSourceSettingsService]);

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
          setLoopStatusMessage(friendlyErrorMessage(error, "读取失败"));
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

  useEffect(() => {
    let cancelled = false;
    setOnboardingMessage("读取中");
    getOnboardingProfileRepository()
      .then((repository) => repository.getByDomain(domain))
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setOnboardingProfile(profile);
        setOnboardingGoal(profile?.goal ?? "");
        setOnboardingInterests(profile?.interests.join("\n") ?? "");
        setOnboardingBackground(profile?.background ?? "");
        setOnboardingMessage(profile ? "已读取" : "未建档");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOnboardingMessage(friendlyErrorMessage(error, "读取建档失败"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [domain]);

  useEffect(() => {
    const snapshot = domainSnapshot;
    if (!snapshot) {
      setFeedRecommendationView(null);
      return;
    }
    const snapshotForFeed: DomainLearningSnapshot = snapshot;
    const onboarding = buildOnboardingSeedProfileFromProfile(onboardingProfile);

    let cancelled = false;
    setFeedMessage("生成推荐中");

    async function syncFeedRecommendations() {
      const [rankerWeights, recommendationRepository] = await Promise.all([
        getRankerWeightRepository(),
        getRecommendationRepository(),
      ]);
      const weights = await rankerWeights.getWeights();
      const view = buildFeedRecommendationView({
        snapshot: snapshotForFeed,
        weights,
        onboarding,
      });

      if (cancelled) {
        return;
      }

      setFeedRecommendationView(view);

      if (view.items.length === 0) {
        setFeedMessage(view.emptyReason ?? "暂无可同步推荐");
        return;
      }

      setFeedMessage("同步推荐候选中");
      const persisted = await persistFeedRecommendationView({
        domain: snapshotForFeed.status.domain,
        view,
        repository: recommendationRepository,
      });

      if (!cancelled) {
        setFeedRecommendationView(persisted);
        setFeedMessage("推荐候选已同步");
      }
    }

    syncFeedRecommendations().catch((error: unknown) => {
      if (!cancelled) {
        setFeedMessage(
          friendlyErrorMessage(error, "推荐候选同步失败"),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [domainSnapshot, onboardingProfile]);

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
      setApiKeyMessage(friendlyErrorMessage(error, "保存失败"));
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
      setApiKeyMessage(friendlyErrorMessage(error, "删除失败"));
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
      setApiKeyMessage(friendlyErrorMessage(error, "读取失败"));
    } finally {
      setIsKeyBusy(false);
    }
  }

  async function saveOnboardingProfile() {
    const goal = onboardingGoal.trim();
    const interests = splitOnboardingInterestsInput(onboardingInterests);
    const background = onboardingBackground.trim() || null;

    if (!goal && interests.length === 0 && !background) {
      setOnboardingMessage("至少填写一项");
      return;
    }

    setIsOnboardingSaving(true);
    setOnboardingMessage("保存中");
    try {
      const repository = await getOnboardingProfileRepository();
      const profile = await repository.upsert({
        domain,
        goal,
        interests,
        background,
        updatedAt: new Date().toISOString(),
      });
      setOnboardingProfile(profile);
      setOnboardingGoal(profile.goal);
      setOnboardingInterests(profile.interests.join("\n"));
      setOnboardingBackground(profile.background ?? "");

      const service = await createRuntimeLearningService();
      const result = await service.recordSelfReport({
        domain,
        statement: onboardingProfileToStatement(profile),
        dimensionHints: [...ONBOARDING_DIMENSION_HINTS],
        confidenceScore: 0.85,
      });
      setLastEvidence(result.evidence);
      setLastResult(result);
      setOnboardingMessage("已保存");
      await refreshLoopStatus(domain);
    } catch (error) {
      setOnboardingMessage(friendlyErrorMessage(error, "保存建档失败"));
    } finally {
      setIsOnboardingSaving(false);
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
      setLoopStatusMessage(friendlyErrorMessage(error, "读取失败"));
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
      const resourceSuggestionProvider =
        createSourceBackedTutorResourceSuggestionProvider({
          sources: createRuntimeResourceSources(resourceSourceStatuses),
          fallbackProvider: createLocalTutorResourceSuggestions,
          sourceLimit: 3,
        });
      const service = createTutorInputService({
        learningEvents,
        promptContextProvider: ({ domain: targetDomain }) =>
          loadTutorPromptContext({
            domain: targetDomain,
            portraits: portraitRepository,
          }),
        replyGenerator,
        resourceSuggestionProvider,
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
      setStatus(friendlyErrorMessage(error, "发送失败"));
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
      setStatus(friendlyErrorMessage(error, "记录验证失败"));
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
      setReadingListMessage(friendlyErrorMessage(error, "更新失败"));
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
      const [learningEvents, rankerWeights, recommendations] = await Promise.all([
        createRuntimeLearningService(),
        getRankerWeightRepository(),
        getRecommendationRepository(),
      ]);
      const result = await recordFeedRecommendationFeedback({
        domain,
        item,
        kind: feedbackKind,
        learningEvents,
        rankerWeights,
        recommendations,
        dwellSeconds:
          feedbackKind === "click" ? FEED_CLICK_DWELL_SECONDS : undefined,
      });
      setLastEvidence(result.learning.evidence);
      setLastResult(result.learning);
      setFeedMessage(feedbackKind === "click" ? "已记录点击" : "已记录跳过");
      await refreshLoopStatus(domain);
    } catch (error) {
      setFeedMessage(friendlyErrorMessage(error, "记录反馈失败"));
    } finally {
      setFeedBusyId(null);
    }
  }

  async function requestPortraitRevision(request: PortraitRevisionRequest) {
    setIsPortraitRevisionSaving(true);
    setPortraitRevisionMessage("提交中");
    try {
      const service = await createRuntimeLearningService();
      const result = await recordPortraitRevisionRequest({
        input: {
          domain,
          dimension: request.dimension.key,
          request: request.request,
          currentSummary: request.dimension.summary,
        },
        learningEvents: service,
      });
      setLastEvidence(result.evidence);
      setLastResult(result);
      setPortraitRevisionMessage("已提交");
      await refreshLoopStatus(domain);
    } catch (error) {
      setPortraitRevisionMessage(
        friendlyErrorMessage(error, "提交协商失败"),
      );
    } finally {
      setIsPortraitRevisionSaving(false);
    }
  }

  const viewMeta = WORKSPACE_VIEW_META[workspaceView];

  return (
    <div className="flex h-[100dvh] overflow-hidden text-[var(--color-ink)]">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-6 backdrop-blur md:flex">
        <div className="flex items-center gap-3 px-1.5">
          <span className="ink-seal h-10 w-10 text-lg">斑</span>
          <div className="min-w-0">
            <div className="ink-title text-lg leading-tight">BanLea</div>
            <div className="mt-1 text-[11px] tracking-[0.42em] text-[var(--color-muted)]">
              伴学
            </div>
          </div>
        </div>

        <nav className="mt-9 flex flex-col gap-1.5">
          {WORKSPACE_VIEW_OPTIONS.map((option) => (
            <button
              className="ink-nav-item"
              data-active={workspaceView === option.view}
              key={option.view}
              onClick={() => setWorkspaceView(option.view)}
              type="button"
            >
              <span className="ink-nav-glyph">{option.glyph}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-9 px-1.5">
          <div className="ink-eyebrow">领域</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DOMAIN_OPTIONS.map((item) => (
              <button
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  domain === item.value
                    ? "border-transparent bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
                }`}
                key={item.value}
                onClick={() => setDomain(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-auto px-1.5 pt-6">
          <hr className="ink-divider" />
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isClaudeReady
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-faint)]"
                }`}
              />
              {isClaudeReady ? "Claude 已就绪" : "Claude 未连接"}
            </span>
            <button
              aria-label="切换主题"
              className="ink-nav-glyph cursor-pointer transition hover:text-[var(--color-ink)]"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "切换到宣纸" : "切换到夜墨"}
              type="button"
            >
              {theme === "dark" ? "日" : "月"}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2.5">
            <span className="ink-seal h-8 w-8 text-sm">斑</span>
            <span className="ink-title text-base">BanLea</span>
          </div>
          <button
            aria-label="切换主题"
            className="ink-nav-glyph cursor-pointer"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            type="button"
          >
            {theme === "dark" ? "日" : "月"}
          </button>
        </header>
        <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-2 backdrop-blur md:hidden">
          {WORKSPACE_VIEW_OPTIONS.map((option) => (
            <button
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
                workspaceView === option.view
                  ? "bg-[var(--color-ink-strong)] text-[var(--color-canvas)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
              key={option.view}
              onClick={() => setWorkspaceView(option.view)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </nav>

        <header className="hidden shrink-0 items-end justify-between gap-4 px-8 pb-5 pt-7 md:flex">
          <div>
            <div className="ink-eyebrow">{viewMeta.eyebrow}</div>
            <h1 className="ink-title mt-2 text-[1.7rem] leading-none">
              {viewMeta.title}
            </h1>
          </div>
          <span className="ink-chip">{domainLabel(domain)}</span>
        </header>

        <section className="min-h-0 flex-1 overflow-hidden">
          {workspaceView === "tutor" ? (
            <div className="mx-auto flex h-full w-full max-w-[860px] flex-col px-4 pb-4 sm:px-6 sm:pb-6">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tutorMessages.length === 0 ? (
                  <div className="ink-fade-in flex min-h-full flex-col items-center justify-center pb-10 text-center">
                    <svg aria-hidden="true" className="opacity-90" height="88" viewBox="0 0 100 100" width="88">
                      <path d="M 79 31 A 35 35 0 1 0 84 57" fill="none" opacity="0.85" stroke="var(--color-ink-strong)" strokeLinecap="round" strokeWidth="5" />
                      <path d="M 82 26 A 39 39 0 1 0 87 60" fill="none" opacity="0.45" stroke="var(--color-accent)" strokeLinecap="round" strokeWidth="1.5" />
                    </svg>
                    <h2 className="ink-title mt-7 text-3xl sm:text-4xl">今日，学些什么？</h2>
                    <p className="mt-3 text-sm text-[var(--color-muted)]">一问一答之间，画像随你生长</p>
                    <div className="mt-7 flex flex-wrap justify-center gap-2">
                      <span className="ink-chip">书单 {readingListSummary.total}</span>
                      <span className="ink-chip">画像 v{dashboardSummary.latestPortraitVersion ?? "—"}</span>
                      <span className="ink-chip">{domainLabel(domain)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-5">
                    {tutorMessages.map((message) => (
                      <div
                        className={`ink-fade-in whitespace-pre-wrap text-sm leading-7 ${
                          message.role === "user" ? "ink-msg-user" : "ink-msg-assistant"
                        }`}
                        key={message.id}
                      >
                        {message.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 pt-3">
                {checkQuestion ? (
                  <div className="ink-card mb-3 border-l-2 border-l-[var(--color-accent)] p-4 text-sm">
                    <div className="ink-eyebrow">检验一下</div>
                    <div className="mt-2 leading-6 text-[var(--color-ink)]">{checkQuestion.prompt}</div>
                    <div className="mt-3 flex gap-2">
                      <button className="ink-btn ink-btn-ghost" disabled={isCheckSaving} onClick={() => recordCheckResult(0.4)} type="button">未掌握</button>
                      <button className="ink-btn ink-btn-seal" disabled={isCheckSaving} onClick={() => recordCheckResult(0.85)} type="button">已掌握</button>
                    </div>
                  </div>
                ) : null}

                <div className="ink-card flex flex-col gap-2 p-2.5 shadow-[var(--shadow-float)] sm:flex-row sm:items-end">
                  <textarea
                    className="min-h-14 flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-sm leading-6 outline-none placeholder:text-[var(--color-faint)]"
                    onChange={(event) => setTutorInput(event.target.value)}
                    placeholder="例如：帮我入门 k8s"
                    value={tutorInput}
                  />
                  <button className="ink-btn ink-btn-seal sm:w-24" disabled={isSending || !tutorInput.trim()} onClick={sendTutorMessage} type="button">
                    {isSending ? "研墨中…" : "问"}
                  </button>
                </div>
                <div className="mt-2 truncate px-1 text-xs text-[var(--color-faint)]">{status}</div>
              </div>
            </div>
          ) : workspaceView === "resources" ? (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[1280px] flex-col px-4 pb-4 sm:px-6 sm:pb-6">
              <div className="flex shrink-0 items-center justify-between gap-3 py-3">
                <div className="hidden text-sm text-[var(--color-muted)] sm:block">书单与推荐，随画像生长</div>
                <div className="flex rounded-full border border-[var(--color-border)] bg-[var(--color-soft)] p-1">
                  {RESOURCE_MODE_OPTIONS.map((option) => (
                    <button
                      className={`rounded-full px-4 py-1.5 text-sm transition ${
                        resourceMode === option.mode
                          ? "bg-[var(--color-surface)] text-[var(--color-ink-strong)] shadow-[var(--shadow-card)]"
                          : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                      }`}
                      key={option.mode}
                      onClick={() => setResourceMode(option.mode)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <section className="ink-card flex min-h-0 flex-1 flex-col overflow-hidden">
                {resourceMode === "reading" ? (
                  <ReadingListWorkspaceView busyId={readingListBusyId} groups={readingListGroups} isLoading={isLoopStatusLoading} items={readingListItems} message={readingListMessage} onChangeStatus={changeReadingStatus} onRefresh={() => refreshLoopStatus()} summary={readingListSummary} />
                ) : (
                  <FeedWorkspaceView busyId={feedBusyId} isLoading={isLoopStatusLoading} message={feedMessage} onFeedback={recordFeedFeedback} onRefresh={() => refreshLoopStatus()} view={feedRecommendationView} />
                )}
              </section>
            </div>
          ) : workspaceView === "dashboard" ? (
            <div className="mx-auto h-full min-h-0 w-full max-w-[1280px] overflow-y-auto px-4 pb-6 pt-3 sm:px-6 md:pt-0">
              <DashboardWorkspaceView evidence={evidenceTimeline} isLoading={isLoopStatusLoading} message={loopStatusMessage} onRefresh={() => refreshLoopStatus()} portraits={portraitTimeline} status={loopStatus} summary={dashboardSummary} />
            </div>
          ) : workspaceView === "portrait" ? (
            <div className="mx-auto h-full min-h-0 w-full max-w-[1080px] overflow-y-auto px-4 pb-6 pt-3 sm:px-6 md:pt-0">
              <PortraitStatusPanel isLoading={isLoopStatusLoading} message={loopStatusMessage} onRefresh={() => refreshLoopStatus()} onRequestRevision={requestPortraitRevision} revisionBusy={isPortraitRevisionSaving} revisionMessage={portraitRevisionMessage} status={loopStatus} timeline={portraitTimeline} />
            </div>
          ) : (
            <div className="mx-auto h-full min-h-0 w-full max-w-[1080px] overflow-y-auto px-4 pb-6 pt-3 sm:px-6 md:pt-0">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="ink-card p-5">
                  <div className="ink-eyebrow">连接</div>
                  <h2 className="ink-title mt-1.5 text-lg">API Key</h2>
                  <div className="mt-3 text-sm text-[var(--color-muted)]">{apiKeyStatus.configured ? apiKeyStatus.maskedKey : "未设置"}{isClaudeReady ? " · Claude 已初始化" : ""}</div>
                  <input className="ink-field mt-3" onChange={(event) => setApiKeyInput(event.target.value)} placeholder="Anthropic API Key" type="password" value={apiKeyInput} />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className="ink-btn ink-btn-seal" disabled={isKeyBusy} onClick={saveKey} type="button">保存</button>
                    <button className="ink-btn ink-btn-ghost" disabled={isKeyBusy} onClick={deleteKey} type="button">删除</button>
                    <button className="ink-btn ink-btn-ghost" disabled={isKeyBusy} onClick={refreshKeyStatus} type="button">刷新</button>
                  </div>
                  <div className="mt-3 text-xs text-[var(--color-faint)]">{apiKeyMessage}</div>
                </section>

                <section className="ink-card p-5">
                  <div className="ink-eyebrow">领域</div>
                  <h2 className="ink-title mt-1.5 text-lg">当前领域</h2>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {DOMAIN_OPTIONS.map((item) => (
                      <button className={domain === item.value ? "ink-btn" : "ink-btn ink-btn-ghost"} key={item.value} onClick={() => setDomain(item.value)} type="button">{item.label}</button>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[var(--color-faint)]">领域决定子画像与推荐的范围，可随时切换。</p>
                </section>
              </div>

              <section className="ink-card mt-4 p-5">
                <div className="ink-eyebrow">建档</div>
                <h2 className="ink-title mt-1.5 text-lg">冷启动建档</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <label className="block text-xs font-medium text-[var(--color-muted)]">目标<input className="ink-field mt-2" onChange={(event) => setOnboardingGoal(event.target.value)} value={onboardingGoal} /></label>
                  <label className="block text-xs font-medium text-[var(--color-muted)]">兴趣方向<textarea className="ink-field mt-2 min-h-20 resize-none" onChange={(event) => setOnboardingInterests(event.target.value)} value={onboardingInterests} /></label>
                  <label className="block text-xs font-medium text-[var(--color-muted)]">背景<textarea className="ink-field mt-2 min-h-20 resize-none" onChange={(event) => setOnboardingBackground(event.target.value)} value={onboardingBackground} /></label>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--color-faint)]">{onboardingMessage}</div>
                  <button className="ink-btn ink-btn-seal" disabled={isOnboardingSaving} onClick={saveOnboardingProfile} type="button">{isOnboardingSaving ? "保存中…" : "保存建档"}</button>
                </div>
              </section>

              <section className="ink-card mt-4 p-5">
                <div className="ink-eyebrow">足迹</div>
                <h2 className="ink-title mt-1.5 text-lg">最近活动</h2>
                <div className="mt-3 text-sm leading-6 text-[var(--color-muted)]">{lastEvidence ? lastEvidence.summary : "暂无活动"}{lastResult ? " · 已同步" : ""}</div>
              </section>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
