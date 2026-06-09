import { describe, expect, it, vi } from "vitest";
import {
  loadLatestTutorHistory,
  saveTutorTurnMessages,
} from "@/features/history";
import type {
  NewTutorSession,
  NewTutorStoredMessage,
  TutorSessionRecord,
  TutorSessionRepository,
  TutorStoredMessage,
} from "@/db/tutorSessionRepo";
import type { TutorMessage } from "@/features/tutor";

function message(overrides: Partial<TutorMessage> = {}): TutorMessage {
  return {
    id: "evidence-12",
    role: "user",
    content: "讲一下 k8s",
    domain: "computer_science",
    createdAt: "2026-06-09T09:00:00.000Z",
    evidenceId: 12,
    ...overrides,
  };
}

function repository(): TutorSessionRepository {
  let nextSessionId = 1;
  let nextMessageId = 1;
  const sessions: TutorSessionRecord[] = [];
  const messages: TutorStoredMessage[] = [];

  return {
    createSession: vi.fn(async (input: NewTutorSession) => {
      const row = { id: nextSessionId, ...input };
      nextSessionId += 1;
      sessions.push(row);
      return row;
    }),
    getLatestByDomain: vi.fn(async (domain: string) =>
      sessions
        .filter((session) => session.domain === domain)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      null,
    ),
    touchSession: vi.fn(async (id: number, updatedAt: string) => {
      const session = sessions.find((item) => item.id === id);
      if (session) {
        session.updatedAt = updatedAt;
      }
    }),
    insertMessage: vi.fn(async (input: NewTutorStoredMessage) => {
      const row = { id: nextMessageId, ...input };
      nextMessageId += 1;
      messages.push(row);
      return row;
    }),
    listMessages: vi.fn(async (sessionId: number) =>
      messages.filter((item) => item.sessionId === sessionId),
    ),
  };
}

describe("tutor history", () => {
  it("无会话时返回空历史", async () => {
    const repo = repository();

    const snapshot = await loadLatestTutorHistory({
      domain: "computer_science",
      repository: repo,
    });

    expect(snapshot.session).toBeNull();
    expect(snapshot.messages).toEqual([]);
  });

  it("保存一轮 tutor 消息并恢复为 UI 消息", async () => {
    const repo = repository();

    const saved = await saveTutorTurnMessages({
      domain: "computer_science",
      repository: repo,
      userMessage: message(),
      assistantMessage: message({
        id: "assistant-evidence-12",
        role: "assistant",
        content: "学习计划\n先做一个最小例子",
        createdAt: "2026-06-09T09:00:02.000Z",
        evidenceId: 12,
      }),
      now: () => "2026-06-09T09:00:00.000Z",
    });

    expect(saved.session.title).toBe("讲一下 k8s");
    expect(saved.messages).toEqual([
      {
        id: "stored-message-1",
        role: "user",
        content: "讲一下 k8s",
        domain: "computer_science",
        createdAt: "2026-06-09T09:00:00.000Z",
        evidenceId: null,
      },
      {
        id: "stored-message-2",
        role: "assistant",
        content: "学习计划\n先做一个最小例子",
        domain: "computer_science",
        createdAt: "2026-06-09T09:00:02.000Z",
        evidenceId: null,
      },
    ]);
  });
});
