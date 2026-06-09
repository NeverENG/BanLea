import { describe, expect, it, vi } from "vitest";
import { loadLearningLoopStatus } from "@/features/events";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { Evidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

function portrait(overrides: Partial<Portrait> = {}): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 2,
    updatedAt: "2026-06-09T07:00:00.000Z",
    confidence: 0.66,
    dimensions: {
      interest: {
        score: 0.7,
        confidence: 0.65,
        summary: "对云原生兴趣较高",
        evidenceIds: [1],
      },
    },
    changeSummary: "上一版画像",
    ...overrides,
  };
}

function record(input: Portrait): PortraitVersionRecord {
  return {
    id: 5,
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
    id: 10,
    domain: "computer_science",
    type: "chat",
    summary: "user 对话：帮我入门 k8s",
    payload: { content: "帮我入门 k8s" },
    createdAt: "2026-06-09T07:30:00.000Z",
    consumedInVersion: null,
    ...overrides,
  };
}

function repositories(args: {
  latest: PortraitVersionRecord | null;
  pending: Evidence[];
}) {
  const evidenceRepo: EvidenceRepository = {
    insert: vi.fn(),
    listUnconsumed: vi.fn(async () => args.pending),
    listByDomain: vi.fn(),
    markConsumed: vi.fn(),
  };
  const portraits: PortraitRepository = {
    save: vi.fn(),
    getLatest: vi.fn(async () => args.latest),
    getByVersion: vi.fn(),
    listByDomain: vi.fn(),
    nextVersion: vi.fn(),
  };
  return { evidence: evidenceRepo, portraits };
}

describe("loadLearningLoopStatus", () => {
  it("返回最新画像版本与未消费证据触发状态", async () => {
    const repos = repositories({
      latest: record(portrait()),
      pending: [evidence({ id: 1 }), evidence({ id: 2 }), evidence({ id: 3 })],
    });

    const status = await loadLearningLoopStatus({
      domain: "computer_science",
      repositories: repos,
      policy: {
        minEvidenceCount: 3,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
      },
    });

    expect(status.portraitVersion).toBe(2);
    expect(status.portraitConfidence).toBe(0.66);
    expect(status.portraitUpdatedAt).toBe("2026-06-09T07:00:00.000Z");
    expect(status.changeSummary).toBe("上一版画像");
    expect(status.unconsumedEvidenceCount).toBe(3);
    expect(status.trigger.shouldRun).toBe(true);
    expect(status.trigger.reason).toBe("evidence_count");
    expect(repos.portraits.getLatest).toHaveBeenCalledWith("computer_science");
    expect(repos.evidence.listUnconsumed).toHaveBeenCalledWith(
      "computer_science",
      undefined,
    );
  });

  it("无画像但有证据时显示首次建档触发", async () => {
    const repos = repositories({
      latest: null,
      pending: [evidence({ id: 9 })],
    });

    const status = await loadLearningLoopStatus({
      domain: "computer_science",
      repositories: repos,
    });

    expect(status.portraitVersion).toBeNull();
    expect(status.unconsumedEvidenceCount).toBe(1);
    expect(status.trigger.shouldRun).toBe(true);
    expect(status.trigger.reason).toBe("first_portrait");
  });

  it("无未消费证据时显示 no_evidence", async () => {
    const repos = repositories({
      latest: record(portrait()),
      pending: [],
    });

    const status = await loadLearningLoopStatus({
      domain: "computer_science",
      repositories: repos,
    });

    expect(status.unconsumedEvidenceCount).toBe(0);
    expect(status.trigger).toEqual({
      shouldRun: false,
      reason: "no_evidence",
      evidenceCount: 0,
    });
  });
});
