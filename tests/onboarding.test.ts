import { describe, expect, it } from "vitest";
import {
  buildOnboardingSeedProfile,
  buildOnboardingSeedProfileFromEvidence,
  buildOnboardingSeedProfileFromProfile,
  ONBOARDING_DIMENSION_HINTS,
  onboardingProfileToStatement,
  splitOnboardingInterestsInput,
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

  it("builds onboarding seeds from a persisted profile", () => {
    const profile = {
      domain: "computer_science",
      goal: "掌握 k8s 实战",
      interests: ["网络", "调度"],
      background: "后端工程师",
      updatedAt: "2026-06-09T11:00:00.000Z",
    };

    const seeds = buildOnboardingSeedProfileFromProfile(profile);

    expect(seeds.topicSeeds.map((seed) => seed.topic)).toEqual([
      "掌握 k8s 实战",
      "网络",
      "调度",
      "后端工程师",
    ]);
    expect(seeds.dimensionHints).toEqual(
      expect.arrayContaining(["goal_orientation", "interest"]),
    );
    expect(onboardingProfileToStatement(profile)).toBe(
      "目标：掌握 k8s 实战\n兴趣：网络、调度\n背景：后端工程师",
    );
  });

  it("splits onboarding interest input by common separators", () => {
    expect(splitOnboardingInterestsInput("k8s, 分布式系统\n网络；调度")).toEqual([
      "k8s",
      "分布式系统",
      "网络",
      "调度",
    ]);
  });
});
