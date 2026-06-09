import type { LearningEventResult, LearningEventService } from "@/features/events";

export interface TutorMessage {
  id: string;
  role: "user";
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

      return {
        message: {
          id: messageId(learning.evidence.id, createdAt),
          role: "user",
          content,
          domain: input.domain,
          createdAt,
          evidenceId: learning.evidence.id ?? null,
        },
        learning,
      };
    },
  };
}
