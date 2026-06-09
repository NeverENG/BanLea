import type {
  TutorSessionRecord,
  TutorSessionRepository,
  TutorStoredMessage,
} from "@/db/tutorSessionRepo";
import type { TutorMessage } from "@/features/tutor";

export interface LoadLatestTutorHistoryOptions {
  domain: string;
  repository: TutorSessionRepository;
}

export interface SaveTutorTurnMessagesOptions {
  domain: string;
  repository: TutorSessionRepository;
  userMessage: TutorMessage;
  assistantMessage: TutorMessage;
  sessionId?: number | null;
  titleSeed?: string;
  now?: () => string;
}

export interface TutorHistorySnapshot {
  session: TutorSessionRecord | null;
  messages: TutorMessage[];
}

export interface SavedTutorTurn {
  session: TutorSessionRecord;
  messages: TutorMessage[];
}

const defaultNow = () => new Date().toISOString();

function titleFromSeed(seed: string): string {
  const trimmed = seed.trim();
  if (!trimmed) {
    return "新对话";
  }
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed;
}

function toTutorMessage(
  domain: string,
  message: TutorStoredMessage,
): TutorMessage {
  return {
    id: `stored-message-${message.id}`,
    role: message.role,
    content: message.content,
    domain,
    createdAt: message.createdAt,
    evidenceId: null,
  };
}

async function resolveSession(
  options: SaveTutorTurnMessagesOptions,
): Promise<TutorSessionRecord> {
  if (typeof options.sessionId === "number") {
    const existing = await options.repository.getLatestByDomain(options.domain);
    if (existing?.id === options.sessionId) {
      return existing;
    }
  }

  const latest = await options.repository.getLatestByDomain(options.domain);
  if (latest) {
    return latest;
  }

  const createdAt = (options.now ?? defaultNow)();
  return options.repository.createSession({
    domain: options.domain,
    title: titleFromSeed(options.titleSeed ?? options.userMessage.content),
    createdAt,
    updatedAt: createdAt,
  });
}

export async function loadLatestTutorHistory(
  options: LoadLatestTutorHistoryOptions,
): Promise<TutorHistorySnapshot> {
  const session = await options.repository.getLatestByDomain(options.domain);
  if (!session) {
    return { session: null, messages: [] };
  }

  const messages = await options.repository.listMessages(session.id);
  return {
    session,
    messages: messages.map((message) => toTutorMessage(options.domain, message)),
  };
}

export async function saveTutorTurnMessages(
  options: SaveTutorTurnMessagesOptions,
): Promise<SavedTutorTurn> {
  const session = await resolveSession(options);
  await Promise.all([
    options.repository.insertMessage({
      sessionId: session.id,
      role: options.userMessage.role,
      content: options.userMessage.content,
      createdAt: options.userMessage.createdAt,
    }),
    options.repository.insertMessage({
      sessionId: session.id,
      role: options.assistantMessage.role,
      content: options.assistantMessage.content,
      createdAt: options.assistantMessage.createdAt,
    }),
  ]);
  await options.repository.touchSession(session.id, options.assistantMessage.createdAt);
  return loadLatestTutorHistory({
    domain: options.domain,
    repository: options.repository,
  }).then((snapshot) => ({
    session: snapshot.session ?? session,
    messages: snapshot.messages,
  }));
}
