import { describe, it, expect } from "vitest";
import {
  parsePortrait,
  portraitSchema,
  dimensionValueSchema,
  MASTER_DIMENSION_KEYS,
  SUB_DIMENSION_KEYS,
} from "@/types/portrait";

describe("画像维度 key", () => {
  it("主 15 维、子 12 维，合计 27（计划 §4）", () => {
    expect(MASTER_DIMENSION_KEYS).toHaveLength(15);
    expect(SUB_DIMENSION_KEYS).toHaveLength(12);
    expect(MASTER_DIMENSION_KEYS.length + SUB_DIMENSION_KEYS.length).toBe(27);
  });

  it("无重复 key", () => {
    const all = [...MASTER_DIMENSION_KEYS, ...SUB_DIMENSION_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("dimensionValueSchema", () => {
  it("evidenceIds 缺省补空数组", () => {
    const r = dimensionValueSchema.parse({ summary: "x", confidence: 0.5 });
    expect(r.evidenceIds).toEqual([]);
  });

  it("confidence 越界被拒", () => {
    expect(
      dimensionValueSchema.safeParse({ summary: "x", confidence: 1.2 }).success,
    ).toBe(false);
  });
});

describe("parsePortrait", () => {
  const valid = {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 7,
    updatedAt: "2026-06-08T12:00:00Z",
    confidence: 0.55,
    dimensions: {
      mastery: {
        score: 0.62,
        confidence: 0.8,
        summary: "数据结构扎实，算法分析偏弱",
        evidenceIds: [12, 18],
      },
      interest: {
        score: 0.8,
        confidence: 0.6,
        trend: "rising",
        summary: "最近频繁问云原生",
      },
    },
    nextFocus: "补强算法复杂度分析",
    changeSummary: "interest 0.6→0.8",
  };

  it("接受合法画像，并补默认值", () => {
    const r = parsePortrait(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.dimensions.interest.evidenceIds).toEqual([]);
      expect(r.data.scope).toBe("domain");
    }
  });

  it("拒绝非法 scope", () => {
    expect(parsePortrait({ ...valid, scope: "weird" }).success).toBe(false);
  });

  it("允许部分维度缺省（局部重评估，§5③）", () => {
    const partial = { ...valid, dimensions: { interest: valid.dimensions.interest } };
    expect(portraitSchema.safeParse(partial).success).toBe(true);
  });
});
