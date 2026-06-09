import { describe, expect, it, vi } from "vitest";
import { createTutorInputService } from "@/features/tutor";
import type { LearningEventResult } from "@/features/events";
import type { Evidence } from "@/types/evidence";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 12,
    domain: "computer_science",
    type: "chat",
    summary: "user 对话：帮我入门 k8s",
    payload: { content: "帮我入门 k8s", role: "user" },
    createdAt: "2026-06-09T06:00:00.000Z",
    consumedInVersion: null,
    ...overrides,
  };
}

function result(input: Evidence): LearningEventResult {
  return {
    evidence: input,
    update: {
      status: "skipped",
      reason: "trigger_not_met",
      trigger: {
        shouldRun: false,
        reason: "evidence_count",
        evidenceCount: 1,
      },
      latest: null,
      consumedEvidenceIds: [],
    },
  };
}

describe("createTutorInputService", () => {
  it("发送用户消息时记录 chat evidence", async () => {
    const recordChat = vi.fn(async () => result(evidence()));
    const service = createTutorInputService({
      learningEvents: { recordChat },
      now: () => "2026-06-09T06:00:01.000Z",
    });

    const turn = await service.sendUserMessage({
      domain: "computer_science",
      content: "  帮我入门 k8s  ",
      sessionId: 7,
    });

    expect(recordChat).toHaveBeenCalledWith({
      domain: "computer_science",
      role: "user",
      content: "帮我入门 k8s",
      sessionId: 7,
    });
    expect(turn.message).toEqual({
      id: "evidence-12",
      role: "user",
      content: "帮我入门 k8s",
      domain: "computer_science",
      createdAt: "2026-06-09T06:00:00.000Z",
      evidenceId: 12,
    });
    expect(turn.userMessage).toEqual(turn.message);
    expect(turn.assistantMessage).toEqual({
      id: "assistant-evidence-12",
      role: "assistant",
      content: "已记录这次问题。当前证据还不够触发画像更新，我会继续积累上下文。",
      domain: "computer_science",
      createdAt: "2026-06-09T06:00:01.000Z",
      evidenceId: 12,
    });
    expect(turn.learning.update.status).toBe("skipped");
  });

  it("空消息不会写入 evidence", async () => {
    const recordChat = vi.fn(async () => result(evidence()));
    const service = createTutorInputService({
      learningEvents: { recordChat },
    });

    await expect(
      service.sendUserMessage({ domain: "computer_science", content: "   " }),
    ).rejects.toThrow("消息不能为空");
    expect(recordChat).not.toHaveBeenCalled();
  });
});
