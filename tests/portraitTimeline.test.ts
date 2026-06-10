import { describe, expect, it, vi } from "vitest";
import {
  buildPortraitDimensionVisualItems,
  loadPortraitTimeline,
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
        nextFocus: null,
      },
      {
        id: 2,
        version: 2,
        createdAt: "2026-06-09T08:00:00.000Z",
        confidence: 0.62,
        changeSummary: "v2",
        dimensionCount: 1,
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
