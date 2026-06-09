import type { LearningEventResult, LearningEventService } from "@/features/events";
import type { PortraitRepository, PortraitVersionRecord } from "@/db/portraitRepo";
import type { DimensionValue, PortraitScope } from "@/types/portrait";

export interface TutorMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  domain: string;
  createdAt: string;
  evidenceId: number | null;
}

export interface SendTutorMessageInput {
  domain: string;
  content: string;
  sessionId?: number;
}

export interface TutorTurnResult {
  userMessage: TutorMessage;
  assistantMessage: TutorMessage;
  /** @deprecated use userMessage */
  message: TutorMessage;
  learning: LearningEventResult;
}

export interface TutorInputServiceOptions {
  learningEvents: Pick<LearningEventService, "recordChat">;
  promptContextProvider?: TutorPromptContextProvider;
  replyGenerator?: TutorReplyGenerator;
  now?: () => string;
}

export interface TutorInputService {
  sendUserMessage(input: SendTutorMessageInput): Promise<TutorTurnResult>;
}

export interface TutorPromptContextOptions {
  domain: string;
  portraits: PortraitRepository;
  maxDimensionsPerPortrait?: number;
  minConfidence?: number;
}

export interface TutorPromptDimension {
  key: string;
  summary: string;
  confidence: number;
  score: number | null;
  tags: string[];
}

export interface TutorPromptPortraitSnapshot {
  scope: PortraitScope;
  domain: string;
  version: number;
  confidence: number;
  updatedAt: string;
  changeSummary: string | null;
  nextFocus: string | null;
  dimensions: TutorPromptDimension[];
}

export interface TutorPromptContext {
  domain: string;
  global: TutorPromptPortraitSnapshot | null;
  domainPortrait: TutorPromptPortraitSnapshot | null;
  systemContext: string;
}

export interface TutorPromptContextProviderInput {
  domain: string;
  content: string;
  sessionId?: number;
  learning: LearningEventResult;
}

export type TutorPromptContextProvider = (
  input: TutorPromptContextProviderInput,
) => Promise<TutorPromptContext | null> | TutorPromptContext | null;

export interface TutorReplyInput {
  domain: string;
  content: string;
  sessionId?: number;
  learning: LearningEventResult;
  promptContext: TutorPromptContext | null;
}

export type TutorReplyGenerator = (
  input: TutorReplyInput,
) => Promise<string> | string;

const defaultNow = () => new Date().toISOString();

function normalizeContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("消息不能为空");
  }
  return trimmed;
}

function messageId(evidenceId: number | undefined, createdAt: string): string {
  return typeof evidenceId === "number" ? `evidence-${evidenceId}` : `message-${createdAt}`;
}

function assistantMessageId(evidenceId: number | undefined, createdAt: string): string {
  return typeof evidenceId === "number"
    ? `assistant-evidence-${evidenceId}`
    : `assistant-${createdAt}`;
}

function assistantReplyContent(learning: LearningEventResult): string {
  if (learning.update.status === "updated") {
    return `已记录这次问题，并更新画像到 v${learning.update.portrait.portraitVersion}。`;
  }
  if (learning.update.status === "deferred") {
    return "已记录这次问题。当前未初始化 API Key，画像更新会先保留在待处理证据里。";
  }
  return "已记录这次问题。当前证据还不够触发画像更新，我会继续积累上下文。";
}

export function createLocalTutorReply(input: TutorReplyInput): string {
  return assistantReplyContent(input.learning);
}

function dimensionToPromptItem(
  key: string,
  value: DimensionValue,
): TutorPromptDimension {
  return {
    key,
    summary: value.summary,
    confidence: value.confidence,
    score: value.score ?? null,
    tags: value.tags ?? [],
  };
}

function snapshotFromRecord(
  record: PortraitVersionRecord,
  maxDimensions: number,
  minConfidence: number,
): TutorPromptPortraitSnapshot {
  const dimensions = Object.entries(record.portrait.dimensions)
    .map(([key, value]) => dimensionToPromptItem(key, value))
    .filter((item) => item.confidence >= minConfidence)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, maxDimensions);

  return {
    scope: record.portrait.scope,
    domain: record.domainId,
    version: record.version,
    confidence: record.confidence,
    updatedAt: record.createdAt,
    changeSummary: record.changeSummary,
    nextFocus: record.portrait.nextFocus ?? null,
    dimensions,
  };
}

function formatDimension(item: TutorPromptDimension): string {
  const score = item.score === null ? "" : ` score=${item.score.toFixed(2)}`;
  const tags = item.tags.length > 0 ? ` tags=${item.tags.join(",")}` : "";
  return `- ${item.key}: ${item.summary} confidence=${item.confidence.toFixed(2)}${score}${tags}`;
}

function formatPortraitSnapshot(
  label: string,
  snapshot: TutorPromptPortraitSnapshot | null,
): string {
  if (!snapshot) {
    return `${label}: 暂无画像`;
  }
  const header = `${label}: v${snapshot.version}, confidence=${snapshot.confidence.toFixed(2)}`;
  const change = snapshot.changeSummary ? `change: ${snapshot.changeSummary}` : null;
  const nextFocus = snapshot.nextFocus ? `next_focus: ${snapshot.nextFocus}` : null;
  const dimensions =
    snapshot.dimensions.length > 0
      ? snapshot.dimensions.map(formatDimension).join("\n")
      : "- 暂无高置信维度";
  return [header, change, nextFocus, "dimensions:", dimensions]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export async function loadTutorPromptContext(
  options: TutorPromptContextOptions,
): Promise<TutorPromptContext> {
  const maxDimensions = options.maxDimensionsPerPortrait ?? 8;
  const minConfidence = options.minConfidence ?? 0.35;
  const [globalRecord, domainRecord] = await Promise.all([
    options.portraits.getLatest("global"),
    options.domain === "global"
      ? Promise.resolve(null)
      : options.portraits.getLatest(options.domain),
  ]);
  const global = globalRecord
    ? snapshotFromRecord(globalRecord, maxDimensions, minConfidence)
    : null;
  const domainPortrait = domainRecord
    ? snapshotFromRecord(domainRecord, maxDimensions, minConfidence)
    : null;
  const systemContext = [
    `domain: ${options.domain}`,
    formatPortraitSnapshot("global_portrait", global),
    formatPortraitSnapshot("domain_portrait", domainPortrait),
  ].join("\n\n");

  return {
    domain: options.domain,
    global,
    domainPortrait,
    systemContext,
  };
}

export function createTutorInputService(
  options: TutorInputServiceOptions,
): TutorInputService {
  const now = options.now ?? defaultNow;
  const replyGenerator = options.replyGenerator ?? createLocalTutorReply;

  return {
    async sendUserMessage(input) {
      const content = normalizeContent(input.content);
      const learning = await options.learningEvents.recordChat({
        domain: input.domain,
        role: "user",
        content,
        sessionId: input.sessionId,
      });
      const createdAt = learning.evidence.createdAt || now();
      const promptContext = options.promptContextProvider
        ? await options.promptContextProvider({
            domain: input.domain,
            content,
            sessionId: input.sessionId,
            learning,
          })
        : null;
      const replyContent = await replyGenerator({
        domain: input.domain,
        content,
        sessionId: input.sessionId,
        learning,
        promptContext,
      });
      const assistantCreatedAt = now();
      const userMessage: TutorMessage = {
        id: messageId(learning.evidence.id, createdAt),
        role: "user",
        content,
        domain: input.domain,
        createdAt,
        evidenceId: learning.evidence.id ?? null,
      };
      const assistantMessage: TutorMessage = {
        id: assistantMessageId(learning.evidence.id, assistantCreatedAt),
        role: "assistant",
        content: replyContent,
        domain: input.domain,
        createdAt: assistantCreatedAt,
        evidenceId: learning.evidence.id ?? null,
      };

      return {
        userMessage,
        assistantMessage,
        message: userMessage,
        learning,
      };
    },
  };
}
