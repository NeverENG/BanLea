import { describe, expect, it, vi } from "vitest";
import { loadTutorPromptContext } from "@/features/tutor";
import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { Portrait } from "@/types/portrait";

function portrait(overrides: Partial<Portrait> = {}): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 2,
    updatedAt: "2026-06-09T12:00:00.000Z",
    confidence: 0.7,
    dimensions: {
      interest: {
        score: 0.8,
        confidence: 0.75,
        summary: "对云原生兴趣较高",
        evidenceIds: [1],
      },
      gaps: {
        confidence: 0.55,
        summary: "workload 与 service 边界仍不稳定",
        evidenceIds: [2],
      },
      velocity: {
        confidence: 0.2,
        summary: "证据不足",
        evidenceIds: [],
      },
    },
    changeSummary: "interest 上升",
    nextFocus: "补 k8s workload",
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
    getLatest: vi.fn(async (domainId: string) =>
      records
        .filter((item) => item.domainId === domainId)
        .sort((left, right) => right.version - left.version)[0] ?? null,
    ),
    getByVersion: vi.fn(),
    listByDomain: vi.fn(),
    nextVersion: vi.fn(),
  };
}

describe("loadTutorPromptContext", () => {
  it("读取主画像和当前领域画像，生成 prompt 上下文", async () => {
    const globalPortrait = portrait({
      scope: "global",
      domain: "global",
      portraitVersion: 1,
      confidence: 0.6,
      dimensions: {
        communication_style: {
          confidence: 0.8,
          summary: "偏直接、结构化解释",
          evidenceIds: [1],
        },
      },
      changeSummary: "主画像初始",
    });
    const domainPortrait = portrait();
    const repo = repository([
      record(globalPortrait, 1),
      record(domainPortrait, 2),
    ]);

    const context = await loadTutorPromptContext({
      domain: "computer_science",
      portraits: repo,
      maxDimensionsPerPortrait: 2,
      minConfidence: 0.5,
    });

    expect(context.global?.version).toBe(1);
    expect(context.domainPortrait?.version).toBe(2);
    expect(context.domainPortrait?.dimensions.map((item) => item.key)).toEqual([
      "interest",
      "gaps",
    ]);
    expect(context.systemContext).toContain("domain: computer_science");
    expect(context.systemContext).toContain("global_portrait: v1");
    expect(context.systemContext).toContain("domain_portrait: v2");
    expect(context.systemContext).toContain("next_focus: 补 k8s workload");
    expect(context.systemContext).not.toContain("velocity");
    expect(repo.getLatest).toHaveBeenCalledWith("global");
    expect(repo.getLatest).toHaveBeenCalledWith("computer_science");
  });

  it("global domain 不重复读取子画像", async () => {
    const repo = repository([]);

    const context = await loadTutorPromptContext({
      domain: "global",
      portraits: repo,
    });

    expect(context.global).toBeNull();
    expect(context.domainPortrait).toBeNull();
    expect(context.systemContext).toContain("domain_portrait: 暂无画像");
    expect(repo.getLatest).toHaveBeenCalledTimes(1);
    expect(repo.getLatest).toHaveBeenCalledWith("global");
  });
});
