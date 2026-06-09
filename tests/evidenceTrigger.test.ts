import { describe, expect, it } from "vitest";
import { DEFAULT_HARNESS_TRIGGER_POLICY } from "@/config";
import { shouldTriggerHarnessUpdate } from "@/core/evidence";
import type { Evidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 1,
    domain: "computer_science",
    type: "chat",
    summary: "问了一个 k8s 问题",
    payload: {},
    createdAt: "2026-06-09T00:00:00.000Z",
    consumedInVersion: null,
    ...overrides,
  };
}

function portrait(): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 1,
    updatedAt: "2026-06-09T00:00:00.000Z",
    confidence: 0.5,
    dimensions: {},
  };
}

describe("shouldTriggerHarnessUpdate", () => {
  it("无未消费证据时不触发", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [],
    });

    expect(decision).toEqual({
      shouldRun: false,
      reason: "no_evidence",
      evidenceCount: 0,
    });
  });

  it("没有历史画像且有证据时触发首次建档", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: null,
      unconsumedEvidence: [evidence({ id: 7 })],
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("first_portrait");
    if (decision.shouldRun) {
      expect(decision.evidenceIds).toEqual([7]);
    }
  });

  it("累计证据数达到阈值时触发", () => {
    const unconsumedEvidence = Array.from({ length: 5 }, (_, index) =>
      evidence({ id: index + 1 }),
    );

    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence,
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("evidence_count");
  });

  it("推荐长停留触发强反馈", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [
        evidence({
          type: "reco_click",
          payload: { dwellSeconds: DEFAULT_HARNESS_TRIGGER_POLICY.strongFeedbackDwellSeconds },
        }),
      ],
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("strong_recommendation_feedback");
  });

  it("推荐跳过立即触发强反馈", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [evidence({ type: "reco_skip" })],
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("strong_recommendation_feedback");
  });

  it("低测验得分触发卡点更新", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [
        evidence({
          type: "quiz",
          payload: { score: DEFAULT_HARNESS_TRIGGER_POLICY.lowQuizScore },
        }),
      ],
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("low_quiz_score");
  });

  it("高自评与低测验得分冲突时触发矛盾信号", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [
        evidence({
          id: 1,
          type: "self_report",
          summary: "用户自评：我已经掌握 k8s",
          payload: {
            statement: "我已经掌握 k8s",
            confidenceScore: 0.92,
          },
        }),
        evidence({
          id: 2,
          type: "quiz",
          summary: "k8s 测验得分 0.4",
          payload: { topic: "k8s", score: 0.4 },
        }),
      ],
      policy: {
        minEvidenceCount: 5,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
        highSelfReportScore: 0.8,
        contradictionScoreGap: 0.3,
      },
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("contradiction_signal");
    if (decision.shouldRun) {
      expect(decision.evidenceIds).toEqual([1, 2]);
    }
  });

  it("自信聊天表达与低测验得分冲突时触发矛盾信号", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [
        evidence({
          id: 1,
          type: "chat",
          summary: "user 对话：这个我已经懂了",
          payload: {
            role: "user",
            content: "这个我已经懂了，应该没问题",
          },
        }),
        evidence({
          id: 2,
          type: "quiz",
          summary: "k8s 测验得分 0.4",
          payload: { topic: "k8s", score: 0.4 },
        }),
      ],
      policy: {
        minEvidenceCount: 5,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
      },
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("contradiction_signal");
  });

  it("结构化自评与测验分数差距不足时不触发矛盾信号", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [
        evidence({
          id: 1,
          type: "self_report",
          summary: "用户自评：我感觉还行",
          payload: {
            statement: "我感觉还行",
            confidenceScore: 0.82,
          },
        }),
        evidence({
          id: 2,
          type: "quiz",
          summary: "k8s 测验得分 0.55",
          payload: { topic: "k8s", score: 0.55 },
        }),
      ],
      policy: {
        minEvidenceCount: 5,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
        highSelfReportScore: 0.8,
        contradictionScoreGap: 0.3,
      },
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("low_quiz_score");
  });

  it("否定性的聊天表达不会误触发矛盾信号", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [
        evidence({
          id: 1,
          type: "chat",
          summary: "user 对话：我还不懂 k8s",
          payload: {
            role: "user",
            content: "我还不懂 k8s",
          },
        }),
        evidence({
          id: 2,
          type: "quiz",
          summary: "k8s 测验得分 0.4",
          payload: { topic: "k8s", score: 0.4 },
        }),
      ],
      policy: {
        minEvidenceCount: 5,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
      },
    });

    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe("low_quiz_score");
  });

  it("证据不足且无强信号时不触发", () => {
    const decision = shouldTriggerHarnessUpdate({
      latestPortrait: portrait(),
      unconsumedEvidence: [evidence({ id: 1 }), evidence({ id: 2 })],
    });

    expect(decision).toEqual({
      shouldRun: false,
      reason: "evidence_count",
      evidenceCount: 2,
    });
  });
});
