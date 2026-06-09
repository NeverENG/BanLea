import { describe, it, expect } from "vitest";
import {
  parseRecommendation,
  newRecommendationSchema,
  recommendationKindSchema,
  RECO_FEATURE_KEYS,
} from "@/types/recommendation";

describe("推荐 schema", () => {
  it("两类候选 learn|read", () => {
    expect(recommendationKindSchema.options).toEqual(["learn", "read"]);
  });

  it("5 个排序特征（§6.2）", () => {
    expect(RECO_FEATURE_KEYS).toEqual([
      "interest_match",
      "adjacency",
      "mentioned",
      "difficulty_fit",
      "novelty",
    ]);
  });

  it("反馈/分数字段有默认值", () => {
    const r = parseRecommendation({ kind: "learn", topic: "k8s" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.domain).toBe("global");
      expect(r.data.clicked).toBe(false);
      expect(r.data.skipped).toBe(false);
      expect(r.data.dwellSeconds).toBe(0);
      expect(r.data.score).toBe(0);
    }
  });

  it("newRecommendation 不含反馈字段", () => {
    const shape = Object.keys(newRecommendationSchema.shape);
    expect(shape).toContain("topic");
    expect(shape).not.toContain("clicked");
    expect(shape).not.toContain("dwellSeconds");
  });
});
