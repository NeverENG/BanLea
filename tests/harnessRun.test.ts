import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { AskOptions } from "@/core/llm";
import {
  runHarnessUpdate,
  type HarnessModel,
  type PortraitPatch,
} from "@/core/harness";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { Evidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

const now = () => "2026-06-09T01:00:00.000Z";

function portrait(overrides: Partial<Portrait> = {}): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 1,
    updatedAt: "2026-06-09T00:00:00.000Z",
    confidence: 0.5,
    dimensions: {
      interest: {
        score: 0.7,
        confidence: 0.6,
        summary: "对云原生兴趣较高",
        evidenceIds: [1],
      },
    },
    changeSummary: "初始画像",
    ...overrides,
  };
}

function record(input: Portrait): PortraitVersionRecord {
  return {
    id: 10,
    domainId: input.domain,
    version: input.portraitVersion,
    portrait: input,
    confidence: input.confidence,
    createdAt: input.updatedAt,
    changeSummary: input.changeSummary ?? null,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 1,
    domain: "computer_science",
    type: "reco_click",
    summary: "点击了 k8s 推荐",
    payload: {},
    createdAt: "2026-06-09T00:30:00.000Z",
    consumedInVersion: null,
    ...overrides,
  };
}

function mockModel<T>(result: T): HarnessModel & { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn(async (_schema: z.ZodType<T>, _opts: AskOptions) => result);
  return { askStructured: ask, ask };
}

function repositories(args: {
  latest: PortraitVersionRecord | null;
  pending: Evidence[];
  saved?: PortraitVersionRecord;
}) {
  const portraits: PortraitRepository = {
    save: vi.fn(async (input: Portrait) => args.saved ?? record(input)),
    getLatest: vi.fn(async () => args.latest),
    getByVersion: vi.fn(),
    listByDomain: vi.fn(),
    nextVersion: vi.fn(),
  };
  const evidenceRepo: EvidenceRepository = {
    insert: vi.fn(),
    listUnconsumed: vi.fn(async () => args.pending),
    listByDomain: vi.fn(),
    markConsumed: vi.fn(async (ids: number[]) => ids.length),
  };
  return { portraits, evidence: evidenceRepo };
}

describe("runHarnessUpdate", () => {
  it("没有未消费证据时跳过，不调用模型、不写库", async () => {
    const repos = repositories({ latest: null, pending: [] });
    const model = mockModel(portrait());

    const result = await runHarnessUpdate({
      scope: "domain",
      domain: "computer_science",
      repositories: repos,
      model,
    });

    expect(result.status).toBe("skipped");
    expect(model.ask).not.toHaveBeenCalled();
    expect(repos.portraits.save).not.toHaveBeenCalled();
    expect(repos.evidence.markConsumed).not.toHaveBeenCalled();
  });

  it("没有历史画像时生成初始画像，保存后标记证据消费", async () => {
    const repos = repositories({ latest: null, pending: [evidence({ id: 1 })] });
    const model = mockModel(portrait({ scope: "global", domain: "wrong" }));

    const result = await runHarnessUpdate({
      scope: "domain",
      domain: "computer_science",
      repositories: repos,
      model,
      now,
    });

    expect(result.status).toBe("updated");
    if (result.status === "updated") {
      expect(result.portrait.portraitVersion).toBe(1);
      expect(result.portrait.updatedAt).toBe(now());
      expect(result.consumedEvidenceIds).toEqual([1]);
      expect(result.consumedCount).toBe(1);
    }
    expect(repos.portraits.save).toHaveBeenCalledTimes(1);
    expect(repos.evidence.markConsumed).toHaveBeenCalledWith([1], 1);
  });

  it("已有画像时局部重评估，保存新版本并消费证据", async () => {
    const previous = portrait({ portraitVersion: 3 });
    const repos = repositories({
      latest: record(previous),
      pending: [evidence({ id: 7 })],
    });
    const patch: PortraitPatch = {
      dimensions: {
        interest: {
          score: 0.82,
          confidence: 0.72,
          summary: "推荐点击后兴趣上升",
          evidenceIds: [7],
        },
      },
      changeSummary: "interest 因推荐点击上调",
    };
    const model = mockModel(patch);

    const result = await runHarnessUpdate({
      scope: "domain",
      domain: "computer_science",
      repositories: repos,
      model,
      now,
    });

    expect(result.status).toBe("updated");
    if (result.status === "updated") {
      expect(result.portrait.portraitVersion).toBe(4);
      expect(result.portrait.dimensions.interest.score).toBe(0.82);
      expect(result.consumedEvidenceIds).toEqual([7]);
    }
    expect(repos.portraits.save).toHaveBeenCalledTimes(1);
    expect(repos.evidence.markConsumed).toHaveBeenCalledWith([7], 4);
  });
});
