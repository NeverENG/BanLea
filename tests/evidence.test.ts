import { describe, it, expect } from "vitest";
import {
  parseEvidence,
  newEvidenceSchema,
  evidenceTypeSchema,
} from "@/types/evidence";

describe("evidenceTypeSchema", () => {
  it("含 §11 约定的 6 种来源", () => {
    expect(evidenceTypeSchema.options).toEqual([
      "chat",
      "self_report",
      "quiz",
      "reading",
      "reco_click",
      "reco_skip",
    ]);
  });
});

describe("evidenceSchema", () => {
  it("payload 默认空对象、consumedInVersion 默认 null", () => {
    const r = parseEvidence({
      domain: "computer_science",
      type: "quiz",
      summary: "算法复杂度小测 6/10",
      createdAt: "2026-06-08T12:00:00Z",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.payload).toEqual({});
      expect(r.data.consumedInVersion).toBeNull();
    }
  });

  it("拒绝非法 type", () => {
    expect(
      parseEvidence({
        domain: "global",
        type: "tweet",
        summary: "x",
        createdAt: "2026-06-08T12:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("newEvidence 不含 id/consumedInVersion", () => {
    const shape = Object.keys(newEvidenceSchema.shape);
    expect(shape).not.toContain("id");
    expect(shape).not.toContain("consumedInVersion");
    expect(shape).toContain("summary");
  });
});
