import { describe, expect, it } from "vitest";
import { buildLearningDashboardSummary } from "@/features/dashboard";
import type { EvidenceTimelineItem } from "@/features/evidence";
import type { LearningLoopStatus } from "@/features/events";
import type { PortraitTimelineItem } from "@/features/portrait";
import type { ReadingListSummary } from "@/features/reading-list";

const reading: ReadingListSummary = {
  total: 4,
  byStatus: {
    todo: 1,
    reading: 0,
    done: 2,
    later: 1,
  },
  doneDwellSeconds: 240,
};

const evidence: EvidenceTimelineItem[] = [
  {
    id: 1,
    type: "chat",
    summary: "chat",
    createdAt: "2026-06-09T08:00:00.000Z",
    consumedInVersion: null,
    status: "pending",
  },
  {
    id: 2,
    type: "reading",
    summary: "reading",
    createdAt: "2026-06-09T08:05:00.000Z",
    consumedInVersion: 3,
    status: "consumed",
  },
];

const portraits: PortraitTimelineItem[] = [
  {
    id: 3,
    version: 3,
    createdAt: "2026-06-09T08:10:00.000Z",
    confidence: 0.72,
    changeSummary: "updated",
    dimensionCount: 2,
    nextFocus: "k8s",
  },
];

const loopStatus: LearningLoopStatus = {
  domain: "computer_science",
  latest: null,
  portraitVersion: 3,
  portraitConfidence: 0.72,
  portraitUpdatedAt: "2026-06-09T08:10:00.000Z",
  changeSummary: "updated",
  unconsumedEvidenceCount: 1,
  trigger: {
    shouldRun: false,
    reason: "evidence_count",
    evidenceCount: 1,
  },
};

describe("buildLearningDashboardSummary", () => {
  it("汇总书单、证据和画像状态", () => {
    const summary = buildLearningDashboardSummary({
      reading,
      evidence,
      portraits,
      loopStatus,
    });

    expect(summary).toEqual({
      totalResources: 4,
      doneResources: 2,
      laterResources: 1,
      doneDwellSeconds: 240,
      evidenceCount: 2,
      pendingEvidenceCount: 1,
      consumedEvidenceCount: 1,
      latestPortraitVersion: 3,
      latestPortraitConfidence: 0.72,
      portraitVersionCount: 1,
      lastActivityAt: "2026-06-09T08:05:00.000Z",
    });
  });
});
