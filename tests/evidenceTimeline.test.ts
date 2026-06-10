import { describe, expect, it, vi } from "vitest";
import { loadEvidenceTimeline } from "@/features/evidence";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { Evidence } from "@/types/evidence";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 1,
    domain: "computer_science",
    type: "chat",
    summary: "user 对话：帮我入门 k8s",
    payload: { content: "帮我入门 k8s" },
    createdAt: "2026-06-09T08:00:00.000Z",
    consumedInVersion: null,
    ...overrides,
  };
}

function repository(rows: Evidence[]): EvidenceRepository {
  return {
    insert: vi.fn(),
    listUnconsumed: vi.fn(),
    listByDomain: vi.fn(async () => rows),
    markConsumed: vi.fn(),
  };
}

describe("loadEvidenceTimeline", () => {
  it("按时间和 id 倒序返回最近 evidence", async () => {
    const repo = repository([
      evidence({
        id: 1,
        type: "chat",
        createdAt: "2026-06-09T08:00:00.000Z",
      }),
      evidence({
        id: 3,
        type: "quiz",
        summary: "k8s 测验得分 0.4",
        payload: { content: "帮我入门 k8s" },
        createdAt: "2026-06-09T09:00:00.000Z",
        consumedInVersion: 2,
      }),
      evidence({
        id: 2,
        type: "self_report",
        summary: "用户自评：我已经掌握 k8s",
        createdAt: "2026-06-09T09:00:00.000Z",
      }),
    ]);

    const timeline = await loadEvidenceTimeline({
      domain: "computer_science",
      repository: repo,
      limit: 2,
    });

    expect(timeline).toEqual([
      {
        id: 3,
        type: "quiz",
        summary: "k8s 测验得分 0.4",
        payload: { content: "帮我入门 k8s" },
        createdAt: "2026-06-09T09:00:00.000Z",
        consumedInVersion: 2,
        status: "consumed",
      },
      {
        id: 2,
        type: "self_report",
        summary: "用户自评：我已经掌握 k8s",
        payload: { content: "帮我入门 k8s" },
        createdAt: "2026-06-09T09:00:00.000Z",
        consumedInVersion: null,
        status: "pending",
      },
    ]);
    expect(repo.listByDomain).toHaveBeenCalledWith("computer_science");
  });
});
