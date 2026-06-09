import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { AskOptions } from "@/core/llm";
import {
  buildInitialPortraitPrompt,
  dimensionKeysForScope,
  generateInitialPortrait,
  inferTouchedDimensions,
  mergePortraitPatch,
  reevaluatePortrait,
  type HarnessModel,
  type PortraitPatch,
} from "@/core/harness";
import type { Evidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";
import { MASTER_DIMENSION_KEYS, SUB_DIMENSION_KEYS } from "@/types/portrait";

const now = () => "2026-06-09T00:00:00.000Z";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 1,
    domain: "computer_science",
    type: "quiz",
    summary: "复杂度小测 6/10，递归复杂度分析卡住",
    payload: {},
    createdAt: "2026-06-08T12:00:00.000Z",
    consumedInVersion: null,
    ...overrides,
  };
}

function domainPortrait(): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 3,
    updatedAt: "2026-06-08T12:00:00.000Z",
    confidence: 0.55,
    dimensions: {
      mastery: {
        score: 0.5,
        confidence: 0.7,
        summary: "数据结构基础稳定",
        evidenceIds: [1],
      },
      interest: {
        score: 0.8,
        confidence: 0.6,
        summary: "对云原生主题兴趣较高",
        evidenceIds: [2],
      },
    },
    nextFocus: "补复杂度分析",
    changeSummary: "上一版建立基础领域画像",
  };
}

function mockModel<T>(result: T): HarnessModel & { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn(async (_schema: z.ZodType<T>, _opts: AskOptions) => result);
  return { askStructured: ask, ask };
}

describe("harness 维度选择", () => {
  it("按 scope 返回主/子画像维度", () => {
    expect(dimensionKeysForScope("global")).toEqual([...MASTER_DIMENSION_KEYS]);
    expect(dimensionKeysForScope("domain")).toEqual([...SUB_DIMENSION_KEYS]);
  });

  it("prompt 只声明当前层允许的维度", () => {
    const prompt = buildInitialPortraitPrompt("global");
    expect(prompt).toContain("logical_reasoning");
    expect(prompt).toContain("goal_orientation");
    expect(prompt).not.toContain("mastery");
  });
});

describe("inferTouchedDimensions", () => {
  it("quiz 证据在子画像中触发能力/卡点相关维度", () => {
    expect(inferTouchedDimensions([evidence()], "domain")).toEqual([
      "mastery",
      "gaps",
      "misconceptions",
      "application",
      "rigor",
      "velocity",
    ]);
  });

  it("推荐点击在子画像中只触发 interest", () => {
    expect(
      inferTouchedDimensions([evidence({ type: "reco_click", summary: "点击 k8s 推荐" })], "domain"),
    ).toEqual(["interest"]);
  });

  it("同类证据推断出的维度会去重", () => {
    const result = inferTouchedDimensions(
      [evidence({ id: 1 }), evidence({ id: 2, summary: "第二次复杂度小测" })],
      "domain",
    );
    expect(new Set(result).size).toBe(result.length);
  });
});

describe("mergePortraitPatch", () => {
  it("只覆盖 patch 中出现的维度，并递增版本", () => {
    const previous = domainPortrait();
    const patch: PortraitPatch = {
      confidence: 0.6,
      dimensions: {
        mastery: {
          score: 0.58,
          confidence: 0.75,
          summary: "复杂度分析仍弱，但基础概念有提升",
          evidenceIds: [1, 3],
        },
      },
      nextFocus: "递归复杂度",
      changeSummary: "mastery 因新测验结果小幅上调",
    };

    const merged = mergePortraitPatch(previous, patch, {
      touchedDimensions: ["mastery"],
      now,
    });

    expect(merged.portraitVersion).toBe(4);
    expect(merged.updatedAt).toBe(now());
    expect(merged.confidence).toBe(0.6);
    expect(merged.dimensions.mastery.summary).toContain("复杂度");
    expect(merged.dimensions.interest).toEqual(previous.dimensions.interest);
  });

  it("拒绝 patch 更新未触及维度", () => {
    expect(() =>
      mergePortraitPatch(
        domainPortrait(),
        {
          dimensions: {
            interest: {
              score: 0.1,
              confidence: 0.5,
              summary: "不应在本次更新",
              evidenceIds: [1],
            },
          },
          changeSummary: "非法更新",
        },
        { touchedDimensions: ["mastery"], now },
      ),
    ).toThrow("不允许的画像维度");
  });

  it("拒绝子画像 patch 写入主画像维度", () => {
    expect(() =>
      mergePortraitPatch(
        domainPortrait(),
        {
          dimensions: {
            logical_reasoning: {
              score: 0.9,
              confidence: 0.5,
              summary: "跨层非法维度",
              evidenceIds: [1],
            },
          },
          changeSummary: "非法更新",
        },
        { touchedDimensions: ["logical_reasoning"], now },
      ),
    ).toThrow("不允许的画像维度");
  });
});

describe("LLM 注入路径", () => {
  it("generateInitialPortrait 调用模型并规范化版本、scope/domain、时间", async () => {
    const model = mockModel<Portrait>({
      ...domainPortrait(),
      scope: "global",
      domain: "wrong",
      portraitVersion: 99,
      updatedAt: "wrong",
    });

    const result = await generateInitialPortrait({
      scope: "domain",
      domain: "computer_science",
      evidence: [evidence()],
      now,
      model,
    });

    expect(result.scope).toBe("domain");
    expect(result.domain).toBe("computer_science");
    expect(result.portraitVersion).toBe(1);
    expect(result.updatedAt).toBe(now());
    expect(model.ask).toHaveBeenCalledTimes(1);
  });

  it("reevaluatePortrait 用推断维度请求 patch 并合并", async () => {
    const model = mockModel<PortraitPatch>({
      dimensions: {
        interest: {
          score: 0.85,
          confidence: 0.7,
          summary: "点击推荐后兴趣上升",
          evidenceIds: [7],
        },
      },
      changeSummary: "interest 因推荐点击上调",
    });

    const result = await reevaluatePortrait({
      previous: domainPortrait(),
      evidence: [
        evidence({
          id: 7,
          type: "reco_click",
          summary: "点击了 k8s 入门推荐",
        }),
      ],
      now,
      model,
    });

    expect(result.portraitVersion).toBe(4);
    expect(result.dimensions.interest.score).toBe(0.85);
    expect(result.dimensions.mastery.score).toBe(0.5);
    expect(model.ask).toHaveBeenCalledTimes(1);
    const options = model.ask.mock.calls[0][1] as AskOptions;
    expect(options.system).toContain("interest");
    expect(options.system).not.toContain("mastery");
  });

  it("无证据时不调用模型、不产生新版本", async () => {
    const model = mockModel<PortraitPatch>({
      dimensions: {},
      changeSummary: "不应被调用",
    });
    const previous = domainPortrait();

    const result = await reevaluatePortrait({ previous, evidence: [], model, now });

    expect(result).toBe(previous);
    expect(model.ask).not.toHaveBeenCalled();
  });
});
