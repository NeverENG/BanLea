import { describe, expect, it, vi } from "vitest";
import { createClaudeTutorReplyGenerator } from "@/features/tutor/claudeReply";
import type { LearningEventResult } from "@/features/events";
import type { TutorPromptContext, TutorReplyInput } from "@/features/tutor";
import type { Evidence } from "@/types/evidence";

function evidence(): Evidence {
  return {
    id: 22,
    domain: "computer_science",
    type: "chat",
    summary: "user 对话：讲一下 service mesh",
    payload: { content: "讲一下 service mesh", role: "user" },
    createdAt: "2026-06-09T07:00:00.000Z",
    consumedInVersion: null,
  };
}

function learning(): LearningEventResult {
  return {
    evidence: evidence(),
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

function promptContext(): TutorPromptContext {
  return {
    domain: "computer_science",
    global: null,
    domainPortrait: null,
    readingList: [],
    systemContext: "domain: computer_science\ncommunication_style: 直接、结构化",
  };
}

function replyInput(overrides: Partial<TutorReplyInput> = {}): TutorReplyInput {
  return {
    domain: "computer_science",
    content: "讲一下 service mesh",
    learning: learning(),
    promptContext: promptContext(),
    ...overrides,
  };
}

describe("createClaudeTutorReplyGenerator", () => {
  it("模型不可用时回落到本地回复", async () => {
    const model = { ask: vi.fn(async () => "should not be used") };
    const generator = createClaudeTutorReplyGenerator({
      model,
      canUseModel: () => false,
    });

    const reply = await generator(replyInput());

    expect(model.ask).not.toHaveBeenCalled();
    expect(reply).toContain("已记录这次问题");
    expect(reply).toContain("继续积累上下文");
  });

  it("模型可用时注入画像上下文并使用轻量模型生成回复", async () => {
    const model = { ask: vi.fn(async () => "  个性化辅导回复  ") };
    const generator = createClaudeTutorReplyGenerator({
      model,
      canUseModel: () => true,
      maxTokens: 600,
    });

    const reply = await generator(replyInput());

    expect(reply).toBe("个性化辅导回复");
    expect(model.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "light",
        effort: "low",
        maxTokens: 600,
      }),
    );
    const request = model.ask.mock.calls[0][0];
    expect(request.system).toContain("communication_style: 直接、结构化");
    expect(request.system).toContain("学习计划、关键解释、练习/验证问题");
    expect(request.messages[0]).toEqual(
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("用户问题：讲一下 service mesh"),
      }),
    );
  });

  it("模型异常时保留本地回复并返回错误摘要", async () => {
    const model = { ask: vi.fn(async () => Promise.reject(new Error("network down"))) };
    const generator = createClaudeTutorReplyGenerator({
      model,
      canUseModel: () => true,
    });

    const reply = await generator(replyInput());

    expect(reply).toContain("已记录这次问题");
    expect(reply).toContain("Claude 回复生成失败：network down");
  });
});
