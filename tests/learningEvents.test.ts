import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { AskOptions } from "@/core/llm";
import type { HarnessModel, PortraitPatch } from "@/core/harness";
import { createLearningEventService } from "@/features/events";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { Evidence, NewEvidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

const now = () => "2026-06-09T03:00:00.000Z";

function portrait(overrides: Partial<Portrait> = {}): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 2,
    updatedAt: "2026-06-09T02:00:00.000Z",
    confidence: 0.6,
    dimensions: {
      interest: {
        score: 0.7,
        confidence: 0.65,
        summary: "对云原生兴趣较高",
        evidenceIds: [1],
      },
    },
    changeSummary: "上一版画像",
    ...overrides,
  };
}

function record(input: Portrait): PortraitVersionRecord {
  return {
    id: 9,
    domainId: input.domain,
    version: input.portraitVersion,
    portrait: input,
    confidence: input.confidence,
    createdAt: input.updatedAt,
    changeSummary: input.changeSummary ?? null,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 11,
    domain: "computer_science",
    type: "chat",
    summary: "user 对话：帮我入门 k8s",
    payload: { content: "帮我入门 k8s" },
    createdAt: now(),
    consumedInVersion: null,
    ...overrides,
  };
}

function mockModel<T>(result: T): HarnessModel & { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn(async (_schema: z.ZodType<T>, _opts: AskOptions) => result);
  return { askStructured: ask, ask };
}

function repositories(args: {
  latest: PortraitVersionRecord | null;
  pending: Evidence[];
}) {
  const evidenceRepo: EvidenceRepository = {
    insert: vi.fn(async (input: NewEvidence) => ({
      ...input,
      id: 11,
      consumedInVersion: null,
    })),
    listUnconsumed: vi.fn(async () => args.pending),
    listByDomain: vi.fn(),
    markConsumed: vi.fn(async (ids: number[]) => ids.length),
  };
  const portraits: PortraitRepository = {
    save: vi.fn(async (input) => record(input)),
    getLatest: vi.fn(async () => args.latest),
    getByVersion: vi.fn(),
    listByDomain: vi.fn(),
    nextVersion: vi.fn(),
  };
  return { evidence: evidenceRepo, portraits };
}

describe("createLearningEventService", () => {
  it("记录聊天事件后，未满足触发条件则不更新画像", async () => {
    const repos = repositories({
      latest: record(portrait()),
      pending: [evidence()],
    });
    const model = mockModel<PortraitPatch>({
      dimensions: {},
      changeSummary: "不应调用",
    });
    const service = createLearningEventService({
      repositories: repos,
      now,
      model,
      policy: {
        minEvidenceCount: 3,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
      },
    });

    const result = await service.recordChat({
      domain: "computer_science",
      role: "user",
      content: "帮我入门 k8s",
    });

    expect(result.evidence.type).toBe("chat");
    expect(result.update.status).toBe("skipped");
    expect(repos.evidence.insert).toHaveBeenCalledWith({
      domain: "computer_science",
      type: "chat",
      summary: "user 对话：帮我入门 k8s",
      payload: {
        content: "帮我入门 k8s",
        role: "user",
        sessionId: undefined,
      },
      createdAt: now(),
    });
    expect(model.ask).not.toHaveBeenCalled();
    expect(repos.portraits.save).not.toHaveBeenCalled();
  });

  it("推荐点击强反馈会触发画像重评估", async () => {
    const previous = portrait();
    const repos = repositories({
      latest: record(previous),
      pending: [
        evidence({
          id: 22,
          type: "reco_click",
          summary: "点击推荐：k8s 入门",
          payload: { topic: "k8s 入门", dwellSeconds: 90 },
        }),
      ],
    });
    const model = mockModel<PortraitPatch>({
      dimensions: {
        interest: {
          score: 0.85,
          confidence: 0.75,
          summary: "推荐点击长停留后兴趣上升",
          evidenceIds: [22],
        },
      },
      changeSummary: "interest 因推荐强反馈上调",
    });
    const service = createLearningEventService({
      repositories: repos,
      now,
      model,
    });

    const result = await service.recordRecommendationClick({
      domain: "computer_science",
      topic: "k8s 入门",
      recommendationId: 5,
      dwellSeconds: 90,
    });

    expect(result.update.status).toBe("updated");
    if (result.update.status === "updated") {
      expect(result.update.trigger.reason).toBe("strong_recommendation_feedback");
      expect(result.update.portrait.portraitVersion).toBe(3);
      expect(result.update.consumedEvidenceIds).toEqual([22]);
    }
    expect(repos.evidence.insert).toHaveBeenCalledTimes(1);
    expect(repos.portraits.save).toHaveBeenCalledTimes(1);
    expect(repos.evidence.markConsumed).toHaveBeenCalledWith([22], 3);
  });

  it("global 自评事件使用主画像 scope", async () => {
    const globalPortrait = portrait({
      scope: "global",
      domain: "global",
      dimensions: {
        goal_orientation: {
          confidence: 0.6,
          summary: "偏职业目标",
          evidenceIds: [3],
        },
      },
    });
    const repos = repositories({
      latest: record(globalPortrait),
      pending: [
        evidence({
          id: 23,
          domain: "global",
          type: "self_report",
          summary: "用户自评：我想通过项目学习",
          payload: { statement: "我想通过项目学习" },
        }),
      ],
    });
    const model = mockModel<PortraitPatch>({
      dimensions: {
        goal_orientation: {
          confidence: 0.7,
          summary: "明确偏项目与职业目标",
          evidenceIds: [23],
        },
      },
      changeSummary: "goal_orientation 因自评更新",
    });
    const service = createLearningEventService({
      repositories: repos,
      now,
      model,
      policy: {
        minEvidenceCount: 1,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
      },
    });

    const result = await service.recordSelfReport({
      domain: "global",
      statement: "我想通过项目学习",
    });

    expect(result.update.status).toBe("updated");
    if (result.update.status === "updated") {
      expect(result.update.portrait.scope).toBe("global");
      expect(result.update.portrait.domain).toBe("global");
      expect(result.update.portrait.dimensions.goal_orientation.summary).toContain("项目");
    }
  });
});
