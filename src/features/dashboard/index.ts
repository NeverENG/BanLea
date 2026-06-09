import type { EvidenceTimelineItem } from "@/features/evidence";
import type { LearningLoopStatus } from "@/features/events";
import type { PortraitTimelineItem } from "@/features/portrait";
import type { ReadingListSummary } from "@/features/reading-list";

export interface LearningDashboardInput {
  reading: ReadingListSummary;
  evidence: EvidenceTimelineItem[];
  portraits: PortraitTimelineItem[];
  loopStatus: LearningLoopStatus;
}

export interface LearningDashboardSummary {
  totalResources: number;
  doneResources: number;
  laterResources: number;
  doneDwellSeconds: number;
  evidenceCount: number;
  pendingEvidenceCount: number;
  consumedEvidenceCount: number;
  latestPortraitVersion: number | null;
  latestPortraitConfidence: number | null;
  portraitVersionCount: number;
  lastActivityAt: string | null;
}

function latestActivityAt(evidence: EvidenceTimelineItem[]): string | null {
  return evidence
    .map((item) => item.createdAt)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export function buildLearningDashboardSummary(
  input: LearningDashboardInput,
): LearningDashboardSummary {
  const pendingEvidenceCount = input.evidence.filter(
    (item) => item.status === "pending",
  ).length;
  const consumedEvidenceCount = input.evidence.filter(
    (item) => item.status === "consumed",
  ).length;

  return {
    totalResources: input.reading.total,
    doneResources: input.reading.byStatus.done,
    laterResources: input.reading.byStatus.later,
    doneDwellSeconds: input.reading.doneDwellSeconds,
    evidenceCount: input.evidence.length,
    pendingEvidenceCount,
    consumedEvidenceCount,
    latestPortraitVersion: input.loopStatus.portraitVersion,
    latestPortraitConfidence: input.loopStatus.portraitConfidence,
    portraitVersionCount: input.portraits.length,
    lastActivityAt: latestActivityAt(input.evidence),
  };
}
