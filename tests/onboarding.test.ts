import { describe, expect, it } from "vitest";
import {
  buildOnboardingSeedProfile,
  buildOnboardingSeedProfileFromEvidence,
  ONBOARDING_DIMENSION_HINTS,
} from "@/features/onboarding";

describe("onboarding seeds", () => {
  it("converts onboarding answers to recommendation seeds and portrait hints", () => {
    const profile = buildOnboardingSeedProfile([
      {
        statement: "  我想学 k8s 实战  ",
        confidenceScore: 0.9,
        dimensionHints: ["goal_orientation"],
      },
      {
        statement: "我想学 k8s 实战",
        confidenceScore: 0.3,
      },
    ]);

    expect(profile.topicSeeds).toHaveLength(1);
    expect(profile.topicSeeds[0]).toMatchObject({
      topic: "我想学 k8s 实战",
      source: "manual",
      reason: "来自冷启动自评",
      strength: 0.9,
      features: {
        interest_match: 0.9,
        difficulty_fit: 0.6,
        novelty: 0.7,
      },
    });
    expect(profile.dimensionHints).toEqual(
      expect.arrayContaining([...ONBOARDING_DIMENSION_HINTS, "goal_orientation"]),
    );
  });

  it("builds onboarding seeds from self-report evidence payload", () => {
    const profile = buildOnboardingSeedProfileFromEvidence([
      {
        id: 1,
        type: "chat",
        summary: "chat",
        payload: { content: "ignore me" },
        createdAt: "2026-06-09T08:00:00.000Z",
        consumedInVersion: null,
        status: "pending",
      },
      {
        id: 2,
        type: "self_report",
        summary: "用户自评：fallback",
        payload: {
          statement: "我想补齐分布式系统",
          confidenceScore: 0.8,
          dimensionHints: ["interest"],
        },
        createdAt: "2026-06-09T08:05:00.000Z",
        consumedInVersion: null,
        status: "pending",
      },
    ]);

    expect(profile.topicSeeds.map((seed) => seed.topic)).toEqual([
      "我想补齐分布式系统",
    ]);
    expect(profile.topicSeeds[0].strength).toBe(0.8);
    expect(profile.dimensionHints).toContain("interest");
  });
});
