import { useEffect, useMemo, useState } from "react";
import { createGitHubResourceSource, type ResourceSourceId } from "@/core/sources";
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
import { ResourceSourceSettingsPanel } from "@/features/settings/ResourceSourceSettingsPanel";
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
import { createSourceBackedTutorResourceSuggestionProvider } from "@/features/tutor/sourceSuggestions";
import type { Evidence } from "@/types/evidence";
import type {
  HarnessRunRepositories,
  TriggeredHarnessUpdateResult,
} from "@/core/harness";
import type { ReadingListStatus } from "@/types/readingList";
import type { OnboardingProfile } from "@/types/onboarding";

type EventKind = "chat" | "self_report" | "quiz" | "reading" | "reco_click" | "reco_skip";
type WorkspaceView = "tutor" | "dashboard" | "portrait" | "profile";
type LearningMode = "tutor" | "reading" | "feed";

const EVENT_OPTIONS: { kind: EventKind; label: string }[] = [
  { kind: "chat", label: "对话" },
  { kind: "self_report", label: "自评" },
  { kind: "quiz", label: "测验" },
  { kind: "reading", label: "阅读" },
  { kind: "reco_click", label: "点击" },
  { kind: "reco_skip", label: "跳过" },
];

const WORKSPACE_VIEW_OPTIONS: { view: WorkspaceView; label: string }[] = [
  { view: "tutor", label: "学习台" },
  { view: "dashboard", label: "数据看板" },
  { view: "portrait", label: "我的画像" },
  { view: "profile", label: "关于我" },
];

const LEARNING_MODE_OPTIONS: { mode: LearningMode; label: string }[] = [
  { mode: "tutor", label: "辅导" },
  { mode: "reading", label: "书单" },
  { mode: "feed", label: "推荐" },
];

const WORKSPACE_VIEW_META: Record<WorkspaceView, { eyebrow: string; title: string }> = {
  tutor: { eyebrow: "Personal learning cockpit", title: "学习台" },
  dashboard: { eyebrow: "Learning analytics", title: "数据看板" },
  portrait: { eyebrow: "Learner model", title: "我的画像" },
  profile: { eyebrow: "Profile & settings", title: "关于我" },
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
  const [learningMode, setLearningMode] = useState<LearningMode>("tutor");
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
  const [resourceSourceStatuses, setResourceSourceStatuses] = useState<
    ResourceSourceRuntimeStatus[]
  >([]);
  const [resourceSourceMessage, setResourceSourceMessage] = useState("未读取");
  const [isResourceSourceBusy, setIsResourceSourceBusy] = useState(false);
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

  const selectedLabel = useMemo(
    () => EVENT_OPTIONS.find((option) => option.kind === kind)?.label ?? kind,
    [kind],
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
    setIsResourceSourceBusy(true);
    resourceSourceSettingsService
      .loadStatus()
      .then((statuses) => {
        if (!cancelled) {
          setResourceSourceStatuses(statuses);
          setResourceSourceMessage(
            `可用源：${enabledResourceSourceIds(statuses).length}`,
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setResourceSourceMessage(
            error instanceof Error ? error.message : "读取失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResourceSourceBusy(false);
        }
      });
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
          setOnboardingMessage(
            error instanceof Error ? error.message : "读取建档失败",
          );
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
          error instanceof Error ? error.message : "推荐候选同步失败",
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

  async function refreshResourceSources() {
    setIsResourceSourceBusy(true);
    setResourceSourceMessage("读取中");
    try {
      const statuses = await resourceSourceSettingsService.loadStatus();
      setResourceSourceStatuses(statuses);
      setResourceSourceMessage(
        `可用源：${enabledResourceSourceIds(statuses).length}`,
      );
    } catch (error) {
      setResourceSourceMessage(error instanceof Error ? error.message : "读取失败");
    } finally {
      setIsResourceSourceBusy(false);
    }
  }

  async function toggleResourceSource(
    sourceId: ResourceSourceId,
    enabled: boolean,
  ) {
    setIsResourceSourceBusy(true);
    setResourceSourceMessage("保存中");
    try {
      const statuses = await resourceSourceSettingsService.setEnabled(
        sourceId,
        enabled,
      );
      setResourceSourceStatuses(statuses);
      setResourceSourceMessage(
        `可用源：${enabledResourceSourceIds(statuses).length}`,
      );
    } catch (error) {
      setResourceSourceMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsResourceSourceBusy(false);
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
      setOnboardingMessage(error instanceof Error ? error.message : "保存建档失败");
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
        error instanceof Error ? error.message : "提交协商失败",
      );
    } finally {
      setIsPortraitRevisionSaving(false);
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
            dimensionHints: [...ONBOARDING_DIMENSION_HINTS],
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
      <main className="min-h-screen p-3 sm:p-5">
        <section className="mx-auto flex h-[calc(100vh-1.5rem)] max-w-7xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_24px_80px_rgba(35,56,45,0.12)] sm:h-[calc(100vh-2.5rem)]">
          <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] text-lg font-semibold text-white">
                    B
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-semibold tracking-tight">BanLea</div>
                    <div className="mt-1 text-sm text-[var(--color-muted)]">
                      {WORKSPACE_VIEW_META[workspaceView].eyebrow} · {domain}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex rounded-md bg-[var(--color-soft)] p-1">
                  {["computer_science", "physics", "global"].map((item) => (
                    <button
                      className={`rounded px-3 py-1.5 text-sm ${
                        domain === item
                          ? "bg-white text-[var(--color-ink)] shadow-sm"
                          : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                      }`}
                      key={item}
                      onClick={() => setDomain(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <nav className="grid grid-cols-2 gap-2 rounded-md bg-[var(--color-soft)] p-1 sm:flex">
                  {WORKSPACE_VIEW_OPTIONS.map((option) => (
                    <button
                      className={`rounded px-3 py-1.5 text-sm ${
                        workspaceView === option.view
                          ? "bg-[var(--color-accent)] text-white shadow-sm"
                          : "text-[var(--color-muted)] hover:bg-white hover:text-[var(--color-ink)]"
                      }`}
                      key={option.view}
                      onClick={() => setWorkspaceView(option.view)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-canvas)]">
            {workspaceView === "tutor" ? (
              <div className="grid h-full min-h-0 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-sm text-[var(--color-muted)]">Learning workspace</div>
                      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                        {WORKSPACE_VIEW_META[workspaceView].title}
                      </h1>
                    </div>
                    <div className="flex rounded-md bg-[var(--color-soft)] p-1">
                      {LEARNING_MODE_OPTIONS.map((option) => (
                        <button
                          className={`rounded px-3 py-1.5 text-sm ${
                            learningMode === option.mode
                              ? "bg-white text-[var(--color-ink)] shadow-sm"
                              : "text-[var(--color-muted)]"
                          }`}
                          key={option.mode}
                          onClick={() => setLearningMode(option.mode)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {learningMode === "tutor" ? (
                    <div className="flex min-h-0 flex-1 flex-col p-5">
                      <div className="flex min-h-0 flex-1 flex-col rounded-md bg-[var(--color-soft)] p-4">
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                          {tutorMessages.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-center text-sm leading-6 text-[var(--color-muted)]">
                              说出你正在学什么。BanLea 会结合画像推荐资料，并把真实资料写入书单。
                            </div>
                          ) : (
                            tutorMessages.map((message) => (
                              <div
                                className={`max-w-[82%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 ${
                                  message.role === "user"
                                    ? "ml-auto bg-[var(--color-accent)] text-white"
                                    : "mr-auto bg-white text-[var(--color-ink)] shadow-sm"
                                }`}
                                key={message.id}
                              >
                                {message.content}
                              </div>
                            ))
                          )}
                        </div>

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <textarea
                            className="min-h-16 flex-1 resize-none rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
                            onChange={(event) => setTutorInput(event.target.value)}
                            value={tutorInput}
                          />
                          <button
                            className="rounded-md bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-24"
                            disabled={isSending}
                            onClick={sendTutorMessage}
                            type="button"
                          >
                            {isSending ? "发送中" : "发送"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : learningMode === "reading" ? (
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

                <aside className="min-h-0 space-y-4 overflow-y-auto">
                  <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                    <div className="text-sm font-medium">快速记录</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
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
                    <label className="mt-3 block text-xs font-medium text-[var(--color-muted)]">
                      内容
                      <textarea
                        className="mt-2 min-h-20 w-full resize-none rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                        onChange={(event) => setContent(event.target.value)}
                        value={content}
                      />
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="text-xs font-medium text-[var(--color-muted)]">
                        得分
                        <input
                          className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                          max="1"
                          min="0"
                          onChange={(event) => setScore(Number(event.target.value))}
                          step="0.05"
                          type="number"
                          value={score}
                        />
                      </label>
                      <label className="text-xs font-medium text-[var(--color-muted)]">
                        停留
                        <input
                          className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                          min="0"
                          onChange={(event) => setDwellSeconds(Number(event.target.value))}
                          type="number"
                          value={dwellSeconds}
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm text-[var(--color-muted)]">
                        {selectedLabel} · {domain}
                      </div>
                      <button
                        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        disabled={isSaving}
                        onClick={recordEvent}
                        type="button"
                      >
                        {isSaving ? "写入中" : "记录"}
                      </button>
                    </div>
                    <div className="mt-3 rounded-md bg-[var(--color-soft)] p-3 text-sm text-[var(--color-muted)]">
                      {status}
                    </div>
                  </section>

                  <DashboardSummaryPanel summary={dashboardSummary} />

                  <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm leading-6 text-[var(--color-muted)]">
                    <div className="text-sm font-medium text-[var(--color-ink)]">本轮验证</div>
                    {checkQuestion ? (
                      <>
                        <div className="mt-3 text-[var(--color-ink)]">{checkQuestion.prompt}</div>
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
                      <div className="mt-3">暂无验证问题</div>
                    )}
                  </section>

                  <ReadingListPanel
                    busyId={readingListBusyId}
                    groups={readingListGroups}
                    items={readingListItems}
                    message={readingListMessage}
                    onChangeStatus={changeReadingStatus}
                    summary={readingListSummary}
                  />
                </aside>
              </div>
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
            ) : workspaceView === "portrait" ? (
              <div className="grid h-full min-h-0 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="text-sm text-[var(--color-muted)]">Learner model</div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">我的画像</h1>
                  <PortraitStatusPanel
                    isLoading={isLoopStatusLoading}
                    message={loopStatusMessage}
                    onRefresh={() => refreshLoopStatus()}
                    onRequestRevision={requestPortraitRevision}
                    revisionBusy={isPortraitRevisionSaving}
                    revisionMessage={portraitRevisionMessage}
                    status={loopStatus}
                    timeline={portraitTimeline}
                  />
                </section>
                <aside className="space-y-4">
                  <DashboardSummaryPanel summary={dashboardSummary} />
                  <EvidenceStatusPanel
                    lastEvidence={lastEvidence}
                    lastResult={lastResult}
                    timeline={evidenceTimeline}
                  />
                </aside>
              </div>
            ) : (
              <div className="grid h-full min-h-0 gap-4 overflow-y-auto p-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <div className="text-sm text-[var(--color-muted)]">Profile & settings</div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">关于我</h1>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <section className="rounded-md border border-[var(--color-border)] p-4">
                      <div className="text-sm font-medium">API Key</div>
                      <div className="mt-3 text-sm text-[var(--color-muted)]">
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
                      <div className="mt-3 text-sm text-[var(--color-muted)]">
                        {apiKeyMessage}
                      </div>
                    </section>

                    <section className="rounded-md border border-[var(--color-border)] p-4">
                      <div className="text-sm font-medium">当前领域</div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {["computer_science", "physics", "global"].map((item) => (
                          <button
                            className={`rounded-md px-3 py-2 text-sm ${
                              domain === item
                                ? "bg-[var(--color-accent)] text-white"
                                : "bg-[var(--color-soft)] text-[var(--color-muted)]"
                            }`}
                            key={item}
                            onClick={() => setDomain(item)}
                            type="button"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>

                  <section className="mt-4 rounded-md border border-[var(--color-border)] p-4">
                    <div className="text-sm font-medium">冷启动建档</div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      <label className="block text-xs font-medium text-[var(--color-muted)]">
                        目标
                        <input
                          className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                          onChange={(event) => setOnboardingGoal(event.target.value)}
                          value={onboardingGoal}
                        />
                      </label>
                      <label className="block text-xs font-medium text-[var(--color-muted)]">
                        兴趣方向
                        <textarea
                          className="mt-2 min-h-20 w-full resize-none rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                          onChange={(event) => setOnboardingInterests(event.target.value)}
                          value={onboardingInterests}
                        />
                      </label>
                      <label className="block text-xs font-medium text-[var(--color-muted)]">
                        背景
                        <textarea
                          className="mt-2 min-h-20 w-full resize-none rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                          onChange={(event) => setOnboardingBackground(event.target.value)}
                          value={onboardingBackground}
                        />
                      </label>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="text-sm text-[var(--color-muted)]">
                        {onboardingMessage}
                      </div>
                      <button
                        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        disabled={isOnboardingSaving}
                        onClick={saveOnboardingProfile}
                        type="button"
                      >
                        {isOnboardingSaving ? "保存中" : "保存建档"}
                      </button>
                    </div>
                  </section>
                </section>

                <aside className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <ResourceSourceSettingsPanel
                    isBusy={isResourceSourceBusy}
                    message={resourceSourceMessage}
                    onRefresh={refreshResourceSources}
                    onToggle={toggleResourceSource}
                    statuses={resourceSourceStatuses}
                  />
                  <EvidenceStatusPanel
                    lastEvidence={lastEvidence}
                    lastResult={lastResult}
                    timeline={evidenceTimeline}
                  />
                </aside>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
