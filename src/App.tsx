import { useEffect, useMemo, useState } from "react";
import { createGitHubResourceSource } from "@/core/sources";
import {
  getDomainRepository,
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
  API_PROVIDER_LABELS,
  type ApiProvider,
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
  addManualReadingListItem,
  addTutorResourceSuggestions,
  buildManualReadingListItemInput,
  changeReadingListItemStatus,
  groupReadingListItems,
  type ManualReadingListDraft,
  type ReadingListGroup,
  type ReadingListSummary,
  type ReadingListViewItem,
} from "@/features/reading-list";
import { ReadingListWorkspaceView } from "@/features/reading-list/ReadingListWorkspaceView";
import {
  createLocalTutorResourceSuggestions,
  createTutorInputService,
  loadTutorPromptContext,
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
import type { DomainRecord, NewDomainRecord } from "@/db/domainRepo";

type WorkspaceView = "tutor" | "resources" | "dashboard" | "portrait" | "profile";
type ResourceMode = "reading" | "feed";
type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "banlea-theme";
const DOMAIN_FOLDER_STORAGE_KEY = "banlea-domain-folders";
const API_PROVIDER_STORAGE_KEY = "banlea-api-provider";

const WORKSPACE_VIEW_OPTIONS: { view: WorkspaceView; label: string; glyph: string }[] = [
  { view: "tutor", label: "学习", glyph: "学" },
  { view: "resources", label: "资料", glyph: "册" },
  { view: "profile", label: "我的", glyph: "吾" },
];

const RESOURCE_MODE_OPTIONS: { mode: ResourceMode; label: string }[] = [
  { mode: "reading", label: "书单" },
  { mode: "feed", label: "推荐" },
];

const API_PROVIDER_OPTIONS: ApiProvider[] = ["claude", "deepseek"];

const DEFAULT_DOMAIN_CREATED_AT = "2026-06-10T00:00:00.000Z";

const DEFAULT_DOMAIN_FOLDERS: NewDomainRecord[] = [
  {
    id: "computer_science",
    name: "计算机",
    createdAt: DEFAULT_DOMAIN_CREATED_AT,
  },
  {
    id: "physics",
    name: "物理",
    createdAt: DEFAULT_DOMAIN_CREATED_AT,
  },
  {
    id: "global",
    name: "全部",
    createdAt: DEFAULT_DOMAIN_CREATED_AT,
  },
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

function domainLabel(domain: string, folders: DomainRecord[]): string {
  return (
    folders.find((item) => item.id === domain)?.name ??
    DEFAULT_DOMAIN_FOLDERS.find((item) => item.id === domain)?.name ??
    domain
  );
}

function slugifyDomainName(name: string): string {
  const asciiSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return asciiSlug || `folder_${Date.now().toString(36)}`;
}

function uniqueDomainId(name: string, folders: DomainRecord[]): string {
  const base = slugifyDomainName(name);
  const ids = new Set([
    ...DEFAULT_DOMAIN_FOLDERS.map((item) => item.id),
    ...folders.map((item) => item.id),
  ]);

  if (!ids.has(base)) {
    return base;
  }

  let index = 2;
  while (ids.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

function mergeDomainFolders(folders: DomainRecord[]): DomainRecord[] {
  const seen = new Set<string>();
  return folders.filter((folder) => {
    if (seen.has(folder.id)) {
      return false;
    }
    seen.add(folder.id);
    return true;
  });
}

function readPreviewDomainFolders(): DomainRecord[] {
  if (typeof window === "undefined") {
    return DEFAULT_DOMAIN_FOLDERS;
  }
  try {
    const saved = window.localStorage.getItem(DOMAIN_FOLDER_STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : [];
    const savedFolders = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is DomainRecord =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as DomainRecord).id === "string" &&
            typeof (item as DomainRecord).name === "string" &&
            typeof (item as DomainRecord).createdAt === "string",
        )
      : [];
    return mergeDomainFolders([...DEFAULT_DOMAIN_FOLDERS, ...savedFolders]);
  } catch {
    return DEFAULT_DOMAIN_FOLDERS;
  }
}

function savePreviewDomainFolders(folders: DomainRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DOMAIN_FOLDER_STORAGE_KEY, JSON.stringify(folders));
  } catch {
    // ignore storage errors
  }
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

function readInitialApiProvider(): ApiProvider {
  if (typeof window === "undefined") {
    return "claude";
  }
  try {
    const saved = window.localStorage.getItem(API_PROVIDER_STORAGE_KEY);
    if (saved === "claude" || saved === "deepseek") {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return "claude";
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
  const [domainFolders, setDomainFolders] = useState<DomainRecord[]>(
    DEFAULT_DOMAIN_FOLDERS,
  );
  const [domainFolderInput, setDomainFolderInput] = useState("");
  const [domainFolderMessage, setDomainFolderMessage] = useState("已就绪");
  const [isDomainFolderBusy, setIsDomainFolderBusy] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("tutor");
  const [resourceMode, setResourceMode] = useState<ResourceMode>("reading");
  const [tutorInput, setTutorInput] = useState("帮我入门 k8s");
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [tutorSessionId, setTutorSessionId] = useState<number | null>(null);
  const [lastEvidence, setLastEvidence] = useState<Evidence | null>(null);
  const [lastResult, setLastResult] = useState<LearningEventResult | null>(null);
  const [status, setStatus] = useState("等待记录");
  const [apiProvider, setApiProvider] = useState<ApiProvider>(readInitialApiProvider);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus>({
    provider: apiProvider,
    configured: false,
    maskedKey: null,
  });
  const [apiKeyMessage, setApiKeyMessage] = useState("未设置");
  const [isKeyBusy, setIsKeyBusy] = useState(false);
  const [isLlmReady, setIsLlmReady] = useState(false);
  const [resourceSourceStatuses, setResourceSourceStatuses] = useState<
    ResourceSourceRuntimeStatus[]
  >([]);
  const [isSending, setIsSending] = useState(false);
  const [onboardingGoal, setOnboardingGoal] = useState("");
  const [onboardingInterests, setOnboardingInterests] = useState("");
  const [onboardingBackground, setOnboardingBackground] = useState("");
  const [onboardingProfile, setOnboardingProfile] =
    useState<OnboardingProfile | null>(null);
  const [onboardingMessage, setOnboardingMessage] = useState("未填写");
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
  const [isManualResourceSaving, setIsManualResourceSaving] = useState(false);
  const [readingListMessage, setReadingListMessage] = useState("未操作");
  const [feedBusyId, setFeedBusyId] = useState<string | null>(null);
  const [feedRecommendationView, setFeedRecommendationView] =
    useState<FeedRecommendationViewModel | null>(null);
  const [feedMessage, setFeedMessage] = useState("未反馈");
  const [portraitRevisionMessage, setPortraitRevisionMessage] =
    useState("未提交");
  const [isPortraitRevisionSaving, setIsPortraitRevisionSaving] = useState(false);

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
    setIsDomainFolderBusy(true);
    getDomainRepository()
      .then((repository) => repository.ensureDefaults(DEFAULT_DOMAIN_FOLDERS))
      .then((folders) => {
        if (cancelled) {
          return;
        }
        setDomainFolders(folders);
        setDomainFolderMessage(`文件夹 ${folders.length}`);
        if (!folders.some((folder) => folder.id === domain)) {
          setDomain(folders[0]?.id ?? "computer_science");
        }
      })
      .catch(() => {
        if (!cancelled) {
          const folders = readPreviewDomainFolders();
          setDomainFolders(folders);
          setDomainFolderMessage("浏览器预览模式");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDomainFolderBusy(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  useEffect(() => {
    let cancelled = false;
    setIsKeyBusy(true);
    apiKeyService
      .initializeSavedKey(apiProvider)
      .then((next) => {
        if (!cancelled) {
          setApiKeyStatus({
            provider: next.provider,
            configured: next.configured,
            maskedKey: next.maskedKey,
          });
          setIsLlmReady(next.clientInitialized);
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
  }, [apiKeyService, apiProvider]);

  useEffect(() => {
    try {
      window.localStorage.setItem(API_PROVIDER_STORAGE_KEY, apiProvider);
    } catch {
      // ignore storage errors
    }
  }, [apiProvider]);

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
        setOnboardingMessage(profile ? "已读取" : "未填写");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOnboardingMessage(friendlyErrorMessage(error, "读取偏好失败"));
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

      setFeedMessage("同步推荐中");
      const persisted = await persistFeedRecommendationView({
        domain: snapshotForFeed.status.domain,
        view,
        repository: recommendationRepository,
      });

      if (!cancelled) {
        setFeedRecommendationView(persisted);
        setFeedMessage("推荐已同步");
      }
    }

    syncFeedRecommendations().catch((error: unknown) => {
      if (!cancelled) {
        setFeedMessage(
          friendlyErrorMessage(error, "推荐同步失败"),
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
      await apiKeyService.save(apiKeyInput, apiProvider);
      const next = await apiKeyService.initializeSavedKey(apiProvider);
      setApiKeyStatus({
        provider: next.provider,
        configured: next.configured,
        maskedKey: next.maskedKey,
      });
      setIsLlmReady(next.clientInitialized);
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
      const next = await apiKeyService.delete(apiProvider);
      setApiKeyStatus(next);
      setIsLlmReady(false);
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
      const next = await apiKeyService.initializeSavedKey(apiProvider);
      setApiKeyStatus({
        provider: next.provider,
        configured: next.configured,
        maskedKey: next.maskedKey,
      });
      setIsLlmReady(next.clientInitialized);
      setApiKeyMessage(next.clientInitialized ? "已初始化" : "未设置");
    } catch (error) {
      setApiKeyMessage(friendlyErrorMessage(error, "读取失败"));
    } finally {
      setIsKeyBusy(false);
    }
  }

  async function createDomainFolder() {
    const name = domainFolderInput.trim();
    if (!name) {
      setDomainFolderMessage("请输入文件夹名称");
      return;
    }

    setIsDomainFolderBusy(true);
    setDomainFolderMessage("创建中");
    try {
      const repository = await getDomainRepository();
      const folder = await repository.insert({
        id: uniqueDomainId(name, domainFolders),
        name,
        createdAt: new Date().toISOString(),
      });
      const folders = await repository.list();
      setDomainFolders(folders);
      setDomain(folder.id);
      setDomainFolderInput("");
      setDomainFolderMessage("已创建");
    } catch (error) {
      const folder: DomainRecord = {
        id: uniqueDomainId(name, domainFolders),
        name,
        createdAt: new Date().toISOString(),
      };
      const folders = mergeDomainFolders([...domainFolders, folder]);
      savePreviewDomainFolders(folders);
      setDomainFolders(folders);
      setDomain(folder.id);
      setDomainFolderInput("");
      setDomainFolderMessage("已在浏览器预览中创建");
    } finally {
      setIsDomainFolderBusy(false);
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
      setOnboardingMessage(friendlyErrorMessage(error, "保存偏好失败"));
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
      updateAfterEvidence: isLlmReady && apiProvider === "claude"
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
      const replyGenerator = isLlmReady
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
            readingList: readingListRepository,
          }),
        replyGenerator,
        resourceSuggestionProvider,
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

  function prependReadingListItem(item: ReadingListViewItem) {
    const nextItems = [item, ...readingListItems];
    setReadingListItems(nextItems);
    setReadingListGroups(groupReadingListItems(nextItems));
    setReadingListSummary((summary) => ({
      ...summary,
      total: summary.total + 1,
      byStatus: {
        ...summary.byStatus,
        [item.status]: summary.byStatus[item.status] + 1,
      },
    }));
  }

  async function addManualResource(
    input: ManualReadingListDraft,
  ): Promise<boolean> {
    const addedAt = new Date().toISOString();
    let previewInput: ReturnType<typeof buildManualReadingListItemInput>;
    try {
      previewInput = buildManualReadingListItemInput({
        ...input,
        domain,
        addedAt,
      });
    } catch (error) {
      setReadingListMessage(friendlyErrorMessage(error, "添加失败"));
      return false;
    }

    setIsManualResourceSaving(true);
    setReadingListMessage("添加中");
    try {
      const repository = await getReadingListRepository();
      const item = await addManualReadingListItem({
        ...input,
        domain,
        repository,
        now: () => addedAt,
      });
      prependReadingListItem(item);
      setReadingListMessage("已添加");
      await refreshLoopStatus(domain);
      return true;
    } catch {
      prependReadingListItem({
        id: null,
        title: previewInput.title,
        kind: previewInput.kind ?? "doc",
        status: previewInput.status ?? "todo",
        url: previewInput.url ?? null,
        addedAt: previewInput.addedAt,
      });
      setReadingListMessage("已在浏览器预览中添加");
      return true;
    } finally {
      setIsManualResourceSaving(false);
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
          <div className="ink-eyebrow">文件夹</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {domainFolders.map((item) => (
              <button
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  domain === item.id
                    ? "border-transparent bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
                }`}
                key={item.id}
                onClick={() => setDomain(item.id)}
                type="button"
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-1.5">
            <input
              className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
              onChange={(event) => setDomainFolderInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void createDomainFolder();
                }
              }}
              placeholder="新文件夹"
              value={domainFolderInput}
            />
            <button
              className="rounded-full bg-[var(--color-ink-strong)] px-3 py-1 text-xs text-[var(--color-canvas)] disabled:opacity-40"
              disabled={isDomainFolderBusy || !domainFolderInput.trim()}
              onClick={createDomainFolder}
              type="button"
            >
              新建
            </button>
          </div>
          <div className="mt-2 truncate text-xs text-[var(--color-faint)]">
            {domainFolderMessage}
          </div>
        </div>

        <div className="mt-auto px-1.5 pt-6">
          <hr className="ink-divider" />
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isLlmReady
                    ? "bg-[var(--color-accent)]"
                    : "bg-[var(--color-faint)]"
                }`}
              />
              {isLlmReady
                ? `${API_PROVIDER_LABELS[apiProvider]} 已就绪`
                : `${API_PROVIDER_LABELS[apiProvider]} 未连接`}
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
          <span className="ink-chip">{domainLabel(domain, domainFolders)}</span>
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
                      <span className="ink-chip">资料 {readingListSummary.total}</span>
                      <span className="ink-chip">{domainLabel(domain, domainFolders)}</span>
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
                <div className="hidden text-sm text-[var(--color-muted)] sm:block">资料链接与待读清单</div>
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
                  <ReadingListWorkspaceView
                    busyId={readingListBusyId}
                    groups={readingListGroups}
                    isAddingManualResource={isManualResourceSaving}
                    isLoading={isLoopStatusLoading}
                    items={readingListItems}
                    message={readingListMessage}
                    onAddManualResource={addManualResource}
                    onChangeStatus={changeReadingStatus}
                    onRefresh={() => refreshLoopStatus()}
                    summary={readingListSummary}
                  />
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
                  <div className="mt-3 flex rounded-full border border-[var(--color-border)] bg-[var(--color-soft)] p-1">
                    {API_PROVIDER_OPTIONS.map((provider) => (
                      <button
                        className={`flex-1 rounded-full px-3 py-1.5 text-sm transition ${
                          apiProvider === provider
                            ? "bg-[var(--color-surface)] text-[var(--color-ink-strong)] shadow-[var(--shadow-card)]"
                            : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                        }`}
                        key={provider}
                        onClick={() => {
                          setApiProvider(provider);
                          setApiKeyInput("");
                        }}
                        type="button"
                      >
                        {API_PROVIDER_LABELS[provider]}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 text-sm text-[var(--color-muted)]">{apiKeyStatus.configured ? apiKeyStatus.maskedKey : "未设置"}{isLlmReady ? ` · ${API_PROVIDER_LABELS[apiProvider]} 已初始化` : ""}</div>
                  <input className="ink-field mt-3" onChange={(event) => setApiKeyInput(event.target.value)} placeholder={`${API_PROVIDER_LABELS[apiProvider]} API Key`} type="password" value={apiKeyInput} />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className="ink-btn ink-btn-seal" disabled={isKeyBusy} onClick={saveKey} type="button">保存</button>
                    <button className="ink-btn ink-btn-ghost" disabled={isKeyBusy} onClick={deleteKey} type="button">删除</button>
                    <button className="ink-btn ink-btn-ghost" disabled={isKeyBusy} onClick={refreshKeyStatus} type="button">刷新</button>
                  </div>
                  <div className="mt-3 text-xs text-[var(--color-faint)]">{apiKeyMessage}</div>
                </section>

                <section className="ink-card p-5">
                  <div className="ink-eyebrow">文件夹</div>
                  <h2 className="ink-title mt-1.5 text-lg">学习文件夹</h2>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {domainFolders.map((item) => (
                      <button className={domain === item.id ? "ink-btn" : "ink-btn ink-btn-ghost"} key={item.id} onClick={() => setDomain(item.id)} type="button">{item.name}</button>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <input
                      className="ink-field"
                      onChange={(event) => setDomainFolderInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void createDomainFolder();
                        }
                      }}
                      placeholder="新建学习文件夹"
                      value={domainFolderInput}
                    />
                    <button
                      className="ink-btn ink-btn-seal shrink-0"
                      disabled={isDomainFolderBusy || !domainFolderInput.trim()}
                      onClick={createDomainFolder}
                      type="button"
                    >
                      新建
                    </button>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[var(--color-faint)]">
                    对话、资料、画像和推荐会按学习文件夹隔离。
                    {domainFolderMessage ? ` ${domainFolderMessage}` : ""}
                  </p>
                </section>
              </div>

              <section className="ink-card mt-4 p-5">
                <div className="ink-eyebrow">偏好</div>
                <h2 className="ink-title mt-1.5 text-lg">学习偏好</h2>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <label className="block text-xs font-medium text-[var(--color-muted)]">目标<input className="ink-field mt-2" onChange={(event) => setOnboardingGoal(event.target.value)} value={onboardingGoal} /></label>
                  <label className="block text-xs font-medium text-[var(--color-muted)]">兴趣方向<textarea className="ink-field mt-2 min-h-20 resize-none" onChange={(event) => setOnboardingInterests(event.target.value)} value={onboardingInterests} /></label>
                  <label className="block text-xs font-medium text-[var(--color-muted)]">背景<textarea className="ink-field mt-2 min-h-20 resize-none" onChange={(event) => setOnboardingBackground(event.target.value)} value={onboardingBackground} /></label>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--color-faint)]">{onboardingMessage}</div>
                  <button className="ink-btn ink-btn-seal" disabled={isOnboardingSaving} onClick={saveOnboardingProfile} type="button">{isOnboardingSaving ? "保存中…" : "保存偏好"}</button>
                </div>
              </section>

              <details className="ink-card mt-4 p-5">
                <summary className="cursor-pointer text-sm font-medium text-[var(--color-muted)]">
                  进阶视图
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    className="ink-btn ink-btn-ghost justify-between px-4 py-3"
                    onClick={() => setWorkspaceView("dashboard")}
                    type="button"
                  >
                    <span>数据看板</span>
                    <span className="text-xs text-[var(--color-faint)]">
                      {dashboardSummary.totalResources} 份资料
                    </span>
                  </button>
                  <button
                    className="ink-btn ink-btn-ghost justify-between px-4 py-3"
                    onClick={() => setWorkspaceView("portrait")}
                    type="button"
                  >
                    <span>我的画像</span>
                    <span className="text-xs text-[var(--color-faint)]">
                      v{dashboardSummary.latestPortraitVersion ?? "—"}
                    </span>
                  </button>
                </div>
              </details>

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
