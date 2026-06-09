import type { LearningEventResult, LearningEventService } from "@/features/events";

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
  now?: () => string;
}

export interface TutorInputService {
  sendUserMessage(input: SendTutorMessageInput): Promise<TutorTurnResult>;
}

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

export function createTutorInputService(
  options: TutorInputServiceOptions,
): TutorInputService {
  const now = options.now ?? defaultNow;

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
        content: assistantReplyContent(learning),
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
