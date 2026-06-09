import { describe, expect, it, vi } from "vitest";
import { createLearningEventService, loadLearningLoopStatus } from "@/features/events";
import { loadEvidenceTimeline } from "@/features/evidence";
import { loadPortraitTimeline } from "@/features/portrait";
import { createTutorInputService } from "@/features/tutor";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { Evidence, NewEvidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

function seedPortrait(): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 1,
    updatedAt: "2026-06-09T10:00:00.000Z",
    confidence: 0.55,
    dimensions: {
      interest: {
        score: 0.65,
        confidence: 0.6,
        summary: "对云原生保持兴趣",
        evidenceIds: [1],
      },
    },
    changeSummary: "初始画像",
  };
}

function portraitRecord(portrait: Portrait, id: number): PortraitVersionRecord {
  return {
    id,
    domainId: portrait.domain,
    version: portrait.portraitVersion,
    portrait,
    confidence: portrait.confidence,
    createdAt: portrait.updatedAt,
    changeSummary: portrait.changeSummary ?? null,
  };
}

function createMemoryRepositories(seed: PortraitVersionRecord[]) {
  let nextEvidenceId = 1;
  const evidenceRows: Evidence[] = [];
  const portraitRows = [...seed];

  const evidence: EvidenceRepository = {
    insert: vi.fn(async (input: NewEvidence) => {
      const row: Evidence = {
        ...input,
        id: nextEvidenceId,
        consumedInVersion: null,
      };
      nextEvidenceId += 1;
      evidenceRows.push(row);
      return row;
    }),
    listUnconsumed: vi.fn(async (domainId: string, limit?: number) => {
      const rows = evidenceRows
        .filter((row) => row.domain === domainId && row.consumedInVersion === null)
        .sort((left, right) => {
          const timeOrder = left.createdAt.localeCompare(right.createdAt);
          return timeOrder === 0 ? (left.id ?? 0) - (right.id ?? 0) : timeOrder;
        });
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    }),
    listByDomain: vi.fn(async (domainId: string) =>
      evidenceRows.filter((row) => row.domain === domainId),
    ),
    markConsumed: vi.fn(async (ids: number[], portraitVersion: number) => {
      let count = 0;
      for (const row of evidenceRows) {
        if (typeof row.id === "number" && ids.includes(row.id)) {
          row.consumedInVersion = portraitVersion;
          count += 1;
        }
      }
      return count;
    }),
  };

  const portraits: PortraitRepository = {
    save: vi.fn(async (portrait: Portrait) => {
      const row = portraitRecord(portrait, portraitRows.length + 1);
      portraitRows.push(row);
      return row;
    }),
    getLatest: vi.fn(async (domainId: string) =>
      portraitRows
        .filter((row) => row.domainId === domainId)
        .sort((left, right) => right.version - left.version)[0] ?? null,
    ),
    getByVersion: vi.fn(async (domainId: string, version: number) =>
      portraitRows.find((row) => row.domainId === domainId && row.version === version) ??
      null,
    ),
    listByDomain: vi.fn(async (domainId: string) =>
      portraitRows
        .filter((row) => row.domainId === domainId)
        .sort((left, right) => left.version - right.version),
    ),
    nextVersion: vi.fn(async (domainId: string) => {
      const latest =
        portraitRows
          .filter((row) => row.domainId === domainId)
          .sort((left, right) => right.version - left.version)[0]?.version ?? 0;
      return latest + 1;
    }),
  };

  return { evidence, portraits };
}

describe("M2 no-key loop integration", () => {
  it("无 API Key 时写入证据、触发 deferred，并保留未消费证据", async () => {
    const repositories = createMemoryRepositories([portraitRecord(seedPortrait(), 1)]);
    const nowValues = [
      "2026-06-09T11:00:00.000Z",
      "2026-06-09T11:01:00.000Z",
      "2026-06-09T11:02:00.000Z",
    ];
    const now = vi.fn(() => nowValues.shift() ?? "2026-06-09T11:03:00.000Z");
    const learningEvents = createLearningEventService({
      repositories,
      now,
      policy: {
        minEvidenceCount: 5,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
        highSelfReportScore: 0.8,
        contradictionScoreGap: 0.3,
      },
    });
    const tutor = createTutorInputService({ learningEvents });

    const chat = await tutor.sendUserMessage({
      domain: "computer_science",
      content: "帮我入门 k8s",
    });
    const selfReport = await learningEvents.recordSelfReport({
      domain: "computer_science",
      statement: "我已经掌握 k8s，应该没问题",
      confidenceScore: 0.92,
    });
    const quiz = await learningEvents.recordQuiz({
      domain: "computer_science",
      topic: "k8s",
      score: 0.4,
    });

    expect(chat.learning.update.status).toBe("skipped");
    expect(selfReport.update.status).toBe("skipped");
    expect(quiz.update.status).toBe("deferred");
    if (quiz.update.status === "deferred") {
      expect(quiz.update.reason).toBe("model_not_initialized");
      expect(quiz.update.trigger.reason).toBe("contradiction_signal");
    }
    expect(repositories.portraits.save).not.toHaveBeenCalled();
    expect(repositories.evidence.markConsumed).not.toHaveBeenCalled();

    const loopStatus = await loadLearningLoopStatus({
      domain: "computer_science",
      repositories,
      policy: {
        minEvidenceCount: 5,
        strongFeedbackDwellSeconds: 45,
        lowQuizScore: 0.6,
        highSelfReportScore: 0.8,
        contradictionScoreGap: 0.3,
      },
    });
    const portraitTimeline = await loadPortraitTimeline({
      domain: "computer_science",
      repository: repositories.portraits,
    });
    const evidenceTimeline = await loadEvidenceTimeline({
      domain: "computer_science",
      repository: repositories.evidence,
    });

    expect(loopStatus.portraitVersion).toBe(1);
    expect(loopStatus.unconsumedEvidenceCount).toBe(3);
    expect(loopStatus.trigger.shouldRun).toBe(true);
    expect(loopStatus.trigger.reason).toBe("contradiction_signal");
    expect(portraitTimeline).toHaveLength(1);
    expect(portraitTimeline[0].version).toBe(1);
    expect(evidenceTimeline).toHaveLength(3);
    expect(evidenceTimeline.map((item) => item.status)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
    expect(evidenceTimeline.map((item) => item.type)).toEqual([
      "quiz",
      "self_report",
      "chat",
    ]);
  });
});
