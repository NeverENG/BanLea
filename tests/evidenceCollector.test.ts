import { describe, expect, it, vi } from "vitest";
import { createEvidenceCollector } from "@/core/evidence";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { Evidence, NewEvidence } from "@/types/evidence";

function makeRepository() {
  const insert = vi.fn(async (input: NewEvidence): Promise<Evidence> => ({
    ...input,
    id: 1,
    consumedInVersion: null,
  }));
  const repository: EvidenceRepository = {
    insert,
    listUnconsumed: vi.fn(),
    listByDomain: vi.fn(),
    markConsumed: vi.fn(),
  };
  return { repository, insert };
}

describe("createEvidenceCollector", () => {
  const now = () => "2026-06-09T02:00:00.000Z";

  it("记录 chat 证据", async () => {
    const { repository, insert } = makeRepository();
    const collector = createEvidenceCollector({ repository, now });

    const row = await collector.recordChat({
      domain: "computer_science",
      role: "user",
      content: "帮我入门 k8s",
      sessionId: 3,
    });

    expect(row.type).toBe("chat");
    expect(insert).toHaveBeenCalledWith({
      domain: "computer_science",
      type: "chat",
      summary: "user 对话：帮我入门 k8s",
      payload: { content: "帮我入门 k8s", role: "user", sessionId: 3 },
      createdAt: now(),
    });
  });

  it("记录 self_report 证据并保留维度提示", async () => {
    const { repository, insert } = makeRepository();
    const collector = createEvidenceCollector({ repository, now });

    await collector.recordSelfReport({
      domain: "global",
      statement: "我更喜欢项目驱动学习",
      dimensionHints: ["preferred_modality", "goal_orientation"],
    });

    expect(insert).toHaveBeenCalledWith({
      domain: "global",
      type: "self_report",
      summary: "用户自评：我更喜欢项目驱动学习",
      payload: {
        statement: "我更喜欢项目驱动学习",
        dimensionHints: ["preferred_modality", "goal_orientation"],
      },
      createdAt: now(),
    });
  });

  it("记录 quiz 证据", async () => {
    const { repository, insert } = makeRepository();
    const collector = createEvidenceCollector({ repository, now });

    await collector.recordQuiz({
      domain: "computer_science",
      topic: "递归复杂度",
      score: 0.5,
      total: 10,
      correct: 5,
    });

    expect(insert).toHaveBeenCalledWith({
      domain: "computer_science",
      type: "quiz",
      summary: "递归复杂度 测验得分 0.5",
      payload: { topic: "递归复杂度", score: 0.5, total: 10, correct: 5 },
      createdAt: now(),
    });
  });

  it("记录 reading 证据并默认 dwellSeconds 为 0", async () => {
    const { repository, insert } = makeRepository();
    const collector = createEvidenceCollector({ repository, now });

    await collector.recordReading({
      domain: "computer_science",
      title: "Kubernetes Concepts",
      status: "done",
    });

    expect(insert).toHaveBeenCalledWith({
      domain: "computer_science",
      type: "reading",
      summary: "阅读 Kubernetes Concepts：done",
      payload: {
        title: "Kubernetes Concepts",
        url: undefined,
        status: "done",
        dwellSeconds: 0,
      },
      createdAt: now(),
    });
  });

  it("记录推荐点击证据", async () => {
    const { repository, insert } = makeRepository();
    const collector = createEvidenceCollector({ repository, now });

    await collector.recordRecommendationClick({
      domain: "computer_science",
      recommendationId: 12,
      topic: "k8s 入门",
      dwellSeconds: 90,
    });

    expect(insert).toHaveBeenCalledWith({
      domain: "computer_science",
      type: "reco_click",
      summary: "点击推荐：k8s 入门",
      payload: { recommendationId: 12, topic: "k8s 入门", dwellSeconds: 90 },
      createdAt: now(),
    });
  });

  it("记录推荐跳过证据，允许自定义 summary", async () => {
    const { repository, insert } = makeRepository();
    const collector = createEvidenceCollector({ repository, now });

    await collector.recordRecommendationSkip({
      domain: "computer_science",
      recommendationId: 13,
      topic: "线性代数复习",
      summary: "用户跳过数学复习推荐",
    });

    expect(insert).toHaveBeenCalledWith({
      domain: "computer_science",
      type: "reco_skip",
      summary: "用户跳过数学复习推荐",
      payload: { recommendationId: 13, topic: "线性代数复习" },
      createdAt: now(),
    });
  });
});
