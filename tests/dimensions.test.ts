import { describe, it, expect } from "vitest";
import {
  DIMENSION_META,
  dimensionsByTier,
  dimensionsByGroup,
  metaMatchesHarness,
} from "@/types/dimensions";
import { MASTER_DIMENSION_KEYS, SUB_DIMENSION_KEYS } from "@/types/portrait";

describe("DIMENSION_META", () => {
  it("覆盖全部 27 维", () => {
    expect(Object.keys(DIMENSION_META)).toHaveLength(27);
  });

  it("harness 标注与维度所属层一致", () => {
    expect(metaMatchesHarness()).toBe(true);
  });

  it("主层 15 维标 master、子层 12 维标 sub", () => {
    const master = Object.values(DIMENSION_META).filter((m) => m.harness === "master");
    const sub = Object.values(DIMENSION_META).filter((m) => m.harness === "sub");
    expect(master).toHaveLength(MASTER_DIMENSION_KEYS.length);
    expect(sub).toHaveLength(SUB_DIMENSION_KEYS.length);
  });
});

describe("分层与分组查询", () => {
  it("三个 tier 互斥且并起来=27", () => {
    const slow = dimensionsByTier("slow");
    const medium = dimensionsByTier("medium");
    const fast = dimensionsByTier("fast");
    expect(slow.length + medium.length + fast.length).toBe(27);
    expect(new Set([...slow, ...medium, ...fast]).size).toBe(27);
  });

  it("每个功能分组都非空", () => {
    expect(dimensionsByGroup("teaching").length).toBeGreaterThan(0);
    expect(dimensionsByGroup("content").length).toBeGreaterThan(0);
    expect(dimensionsByGroup("reco").length).toBeGreaterThan(0);
  });

  it("interest 是快变 + 推荐组（§4.4 示例）", () => {
    expect(DIMENSION_META.interest.tier).toBe("fast");
    expect(DIMENSION_META.interest.groups).toContain("reco");
  });
});
