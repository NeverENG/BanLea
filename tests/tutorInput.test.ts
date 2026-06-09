import { describe, expect, it, vi } from "vitest";
import { createTutorInputService } from "@/features/tutor";
import type { LearningEventResult } from "@/features/events";
import type { TutorPromptContext } from "@/features/tutor";
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
    expect(turn.assistantMessage).toEqual(
      expect.objectContaining({
        id: "assistant-evidence-12",
        role: "assistant",
        domain: "computer_science",
        createdAt: "2026-06-09T06:00:01.000Z",
        evidenceId: 12,
      }),
    );
    expect(turn.assistantMessage.content).toContain("学习计划");
    expect(turn.assistantMessage.content).toContain("关键解释");
    expect(turn.assistantMessage.content).toContain("练习/验证问题");
    expect(turn.assistantMessage.content).toContain("已记录这次问题");
    expect(turn.resourceSuggestions).toEqual([]);
    expect(turn.learning.update.status).toBe("skipped");
  });

  it("支持注入画像上下文和自定义 assistant 回复生成器", async () => {
    const learning = result(evidence({ id: 18 }));
    const recordChat = vi.fn(async () => learning);
    const promptContext: TutorPromptContext = {
      domain: "computer_science",
      global: null,
      domainPortrait: null,
      systemContext: "domain: computer_science\nstyle: direct",
    };
    const promptContextProvider = vi.fn(async () => promptContext);
    const replyGenerator = vi.fn(async () => "按画像上下文生成的回复");
    const resourceSuggestionProvider = vi.fn(async () => [
      {
        title: "service mesh 入门资料",
        kind: "doc" as const,
        reason: "本轮问题建议",
      },
    ]);
    const service = createTutorInputService({
      learningEvents: { recordChat },
      now: () => "2026-06-09T06:00:02.000Z",
      promptContextProvider,
      replyGenerator,
      resourceSuggestionProvider,
    });

    const turn = await service.sendUserMessage({
      domain: "computer_science",
      content: "  讲一下 service mesh  ",
      sessionId: 9,
    });

    expect(promptContextProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "computer_science",
        content: "讲一下 service mesh",
        sessionId: 9,
        learning,
      }),
    );
    expect(replyGenerator).toHaveBeenCalledWith({
      domain: "computer_science",
      content: "讲一下 service mesh",
      sessionId: 9,
      learning,
      promptContext,
    });
    expect(resourceSuggestionProvider).toHaveBeenCalledWith({
      domain: "computer_science",
      content: "讲一下 service mesh",
      sessionId: 9,
      learning,
      promptContext,
    });
    expect(turn.assistantMessage.content).toBe("按画像上下文生成的回复");
    expect(turn.assistantMessage.id).toBe("assistant-evidence-18");
    expect(turn.resourceSuggestions).toEqual([
      {
        title: "service mesh 入门资料",
        kind: "doc",
        reason: "本轮问题建议",
      },
    ]);
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
