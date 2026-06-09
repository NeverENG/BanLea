import { describe, expect, it, vi } from "vitest";
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
    const service = createLearningEventService({
      repositories: repos,
      now,
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
    expect(repos.portraits.save).not.toHaveBeenCalled();
  });

  it("推荐点击强反馈可交给注入的更新入口完成画像重评估", async () => {
    const previous = portrait();
    const updated = portrait({
      portraitVersion: 3,
      dimensions: {
        interest: {
          score: 0.85,
          confidence: 0.75,
          summary: "推荐点击长停留后兴趣上升",
          evidenceIds: [22],
        },
      },
    });
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
    const updateAfterEvidence = vi.fn(async () => ({
      status: "updated" as const,
      trigger: {
        shouldRun: true as const,
        reason: "strong_recommendation_feedback" as const,
        evidenceCount: 1,
        evidenceIds: [22],
      },
      portrait: updated,
      record: record(updated),
      consumedEvidenceIds: [22],
      consumedCount: 1,
    }));
    const service = createLearningEventService({
      repositories: repos,
      now,
      updateAfterEvidence,
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
    expect(updateAfterEvidence).toHaveBeenCalledTimes(1);
  });

  it("模型不可用时只记录证据并延迟画像更新", async () => {
    const repos = repositories({
      latest: null,
      pending: [
        evidence({
          id: 22,
          type: "reco_click",
          summary: "点击推荐：k8s 入门",
          payload: { topic: "k8s 入门", dwellSeconds: 90 },
        }),
      ],
    });
    const service = createLearningEventService({
      repositories: repos,
      now,
    });

    const result = await service.recordRecommendationClick({
      domain: "computer_science",
      topic: "k8s 入门",
      dwellSeconds: 90,
    });

    expect(result.update.status).toBe("deferred");
    expect(repos.evidence.insert).toHaveBeenCalledTimes(1);
    expect(repos.portraits.save).not.toHaveBeenCalled();
    expect(repos.evidence.markConsumed).not.toHaveBeenCalled();
  });

  it("global 自评事件在无更新入口时安全延迟", async () => {
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
    const service = createLearningEventService({
      repositories: repos,
      now,
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

    expect(result.evidence.domain).toBe("global");
    expect(result.update.status).toBe("deferred");
    expect(repos.portraits.save).not.toHaveBeenCalled();
  });
});
