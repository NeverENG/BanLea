import { describe, expect, it, vi } from "vitest";
import {
  buildPortraitDimensionTrendItems,
  buildPortraitDimensionVisualItems,
  buildPortraitRadarModel,
  buildPortraitRevisionEvidenceDraft,
  loadPortraitTimeline,
  recordPortraitRevisionRequest,
} from "@/features/portrait";
import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { Portrait } from "@/types/portrait";

function portrait(overrides: Partial<Portrait> = {}): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 1,
    updatedAt: "2026-06-09T08:00:00.000Z",
    confidence: 0.5,
    dimensions: {
      interest: {
        score: 0.7,
        confidence: 0.65,
        summary: "对云原生兴趣较高",
        evidenceIds: [1],
      },
    },
    changeSummary: "初始画像",
    ...overrides,
  };
}

function record(input: Portrait, id: number): PortraitVersionRecord {
  return {
    id,
    domainId: input.domain,
    version: input.portraitVersion,
    portrait: input,
    confidence: input.confidence,
    createdAt: input.updatedAt,
    changeSummary: input.changeSummary ?? null,
  };
}

function repository(records: PortraitVersionRecord[]): PortraitRepository {
  return {
    save: vi.fn(),
    getLatest: vi.fn(),
    getByVersion: vi.fn(),
    listByDomain: vi.fn(async () => records),
    nextVersion: vi.fn(),
  };
}

describe("loadPortraitTimeline", () => {
  it("按版本倒序返回最近画像版本", async () => {
    const repo = repository([
      record(portrait({ portraitVersion: 1, changeSummary: "v1" }), 1),
      record(
        portrait({
          portraitVersion: 2,
          confidence: 0.62,
          changeSummary: "v2",
          nextFocus: "补 k8s workload",
        }),
        2,
      ),
      record(portrait({ portraitVersion: 3, changeSummary: "v3" }), 3),
    ]);

    const timeline = await loadPortraitTimeline({
      domain: "computer_science",
      repository: repo,
      limit: 2,
    });

    expect(timeline).toEqual([
      {
        id: 3,
        version: 3,
        createdAt: "2026-06-09T08:00:00.000Z",
        confidence: 0.5,
        changeSummary: "v3",
        dimensionCount: 1,
        dimensions: {
          interest: {
            score: 0.7,
            confidence: 0.65,
            summary: "对云原生兴趣较高",
            evidenceIds: [1],
          },
        },
        nextFocus: null,
      },
      {
        id: 2,
        version: 2,
        createdAt: "2026-06-09T08:00:00.000Z",
        confidence: 0.62,
        changeSummary: "v2",
        dimensionCount: 1,
        dimensions: {
          interest: {
            score: 0.7,
            confidence: 0.65,
            summary: "对云原生兴趣较高",
            evidenceIds: [1],
          },
        },
        nextFocus: "补 k8s workload",
      },
    ]);
    expect(repo.listByDomain).toHaveBeenCalledWith("computer_science");
  });
});

describe("buildPortraitDimensionVisualItems", () => {
  it("maps latest portrait dimensions to visual items", () => {
    const items = buildPortraitDimensionVisualItems(
      portrait({
        dimensions: {
          interest: {
            score: 0.7,
            confidence: 0.65,
            summary: "对云原生兴趣较高",
            evidenceIds: [1, 2],
          },
          mastery: {
            score: 0.5,
            confidence: 0.35,
            summary: "基础仍不稳",
            evidenceIds: [],
          },
          unknown_dimension: {
            score: 1,
            confidence: 1,
            summary: "ignore",
            evidenceIds: [],
          },
        },
      }),
      { lowConfidenceThreshold: 0.4 },
    );

    expect(items.map((item) => item.key)).toEqual(["interest", "mastery"]);
    expect(items[0]).toMatchObject({
      label: "兴趣强度",
      score: 0.7,
      confidence: 0.65,
      value: 0.7,
      evidenceCount: 2,
      isLowConfidence: false,
    });
    expect(items[1]).toMatchObject({
      label: "掌握程度",
      isLowConfidence: true,
    });
  });
});

describe("buildPortraitRadarModel", () => {
  it("projects dimension values into radar points", () => {
    const items = buildPortraitDimensionVisualItems(
      portrait({
        dimensions: {
          mastery: {
            score: 1,
            confidence: 0.9,
            summary: "强",
            evidenceIds: [1],
          },
          progress: {
            score: 0.5,
            confidence: 0.8,
            summary: "中",
            evidenceIds: [2],
          },
          interest: {
            score: 0,
            confidence: 0.7,
            summary: "低",
            evidenceIds: [3],
          },
        },
      }),
    );

    const radar = buildPortraitRadarModel(items, 100);

    expect(radar.size).toBe(100);
    expect(radar.center).toBe(50);
    expect(radar.points).toHaveLength(3);
    expect(radar.points[0].value).toBe(1);
    expect(radar.points[1].value).toBe(0.5);
    expect(radar.points[2].value).toBe(0);
    expect(radar.polygonPoints.split(" ")).toHaveLength(3);
  });
});

describe("buildPortraitDimensionTrendItems", () => {
  it("extracts key dimension trends across portrait versions", () => {
    const timeline = [
      {
        id: 2,
        version: 2,
        createdAt: "2026-06-09T08:10:00.000Z",
        confidence: 0.7,
        changeSummary: "v2",
        dimensionCount: 1,
        dimensions: {
          interest: {
            score: 0.8,
            confidence: 0.7,
            summary: "兴趣上升",
            evidenceIds: [2],
          },
        },
        nextFocus: null,
      },
      {
        id: 1,
        version: 1,
        createdAt: "2026-06-09T08:00:00.000Z",
        confidence: 0.6,
        changeSummary: "v1",
        dimensionCount: 1,
        dimensions: {
          interest: {
            score: 0.5,
            confidence: 0.6,
            summary: "初始兴趣",
            evidenceIds: [1],
          },
        },
        nextFocus: null,
      },
    ];

    const trends = buildPortraitDimensionTrendItems(timeline, {
      keys: ["interest", "mastery"],
    });

    expect(trends).toHaveLength(1);
    expect(trends[0].label).toBe("兴趣强度");
    expect(trends[0].points.map((point) => point.version)).toEqual([1, 2]);
    expect(trends[0].latestValue).toBe(0.8);
    expect(trends[0].delta).toBeCloseTo(0.3);
  });
});

describe("portrait revision requests", () => {
  it("builds a self-report evidence draft for a dimension revision", () => {
    const draft = buildPortraitRevisionEvidenceDraft({
      domain: "computer_science",
      dimension: "interest",
      request: "我对 k8s 的兴趣比画像里更强",
      currentSummary: "兴趣中等",
      confidenceScore: 1.2,
    });

    expect(draft).toEqual({
      domain: "computer_science",
      statement:
        "希望调整画像维度「兴趣强度」：我对 k8s 的兴趣比画像里更强\n当前摘要：兴趣中等",
      dimensionHints: ["interest"],
      confidenceScore: 1,
      summary: "画像协商：兴趣强度",
    });
  });

  it("records portrait revision requests through self-report evidence", async () => {
    const result = {
      evidence: {
        id: 1,
        domain: "computer_science",
        type: "self_report" as const,
        summary: "画像协商：掌握程度",
        payload: {},
        createdAt: "2026-06-10T09:00:00.000Z",
        consumedInVersion: null,
      },
      update: {
        status: "skipped" as const,
        reason: "trigger_not_met" as const,
        trigger: {
          shouldRun: false as const,
          reason: "evidence_count" as const,
          evidenceCount: 1,
        },
        latest: null,
        consumedEvidenceIds: [],
      },
    };
    const learningEvents = {
      recordSelfReport: vi.fn(async () => result),
    };

    const saved = await recordPortraitRevisionRequest({
      input: {
        domain: "computer_science",
        dimension: "mastery",
        request: "我已经掌握基础概念",
      },
      learningEvents,
    });

    expect(saved).toBe(result);
    expect(learningEvents.recordSelfReport).toHaveBeenCalledWith({
      domain: "computer_science",
      statement: "希望调整画像维度「掌握程度」：我已经掌握基础概念",
      dimensionHints: ["mastery"],
      confidenceScore: 0.8,
      summary: "画像协商：掌握程度",
    });
  });
});
