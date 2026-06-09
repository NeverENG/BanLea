import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { PortraitRepository } from "@/db/portraitRepo";
import type { ReadingListRepository } from "@/db/readingListRepo";
import type { TutorSessionRepository } from "@/db/tutorSessionRepo";
import {
  loadEvidenceTimeline,
  type EvidenceTimelineItem,
} from "@/features/evidence";
import {
  loadLearningLoopStatus,
  type LearningLoopStatus,
} from "@/features/events";
import { loadLatestTutorHistory, type TutorHistorySnapshot } from "@/features/history";
import {
  loadPortraitTimeline,
  type PortraitTimelineItem,
} from "@/features/portrait";
import {
  loadReadingListOverview,
  type ReadingListOverview,
  type ReadingListSummary,
} from "@/features/reading-list";

export interface DomainLearningSnapshotRepositories {
  evidence: EvidenceRepository;
  portraits: PortraitRepository;
  readingList: ReadingListRepository;
  tutorSessions: TutorSessionRepository;
}

export interface LoadDomainLearningSnapshotOptions {
  domain: string;
  repositories: DomainLearningSnapshotRepositories;
  evidenceLimit?: number;
  portraitLimit?: number;
}

export interface DomainLearningSnapshot {
  status: LearningLoopStatus;
  portraitTimeline: PortraitTimelineItem[];
  evidenceTimeline: EvidenceTimelineItem[];
  readingList: ReadingListOverview;
  tutorHistory: TutorHistorySnapshot;
  dashboard: LearningDashboardSummary;
}

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

export async function loadDomainLearningSnapshot(
  options: LoadDomainLearningSnapshotOptions,
): Promise<DomainLearningSnapshot> {
  const [status, portraitTimeline, evidenceTimeline, readingList, tutorHistory] =
    await Promise.all([
      loadLearningLoopStatus({
        domain: options.domain,
        repositories: {
          evidence: options.repositories.evidence,
          portraits: options.repositories.portraits,
        },
        evidenceLimit: options.evidenceLimit,
      }),
      loadPortraitTimeline({
        domain: options.domain,
        repository: options.repositories.portraits,
        limit: options.portraitLimit,
      }),
      loadEvidenceTimeline({
        domain: options.domain,
        repository: options.repositories.evidence,
        limit: options.evidenceLimit,
      }),
      loadReadingListOverview({
        domain: options.domain,
        repository: options.repositories.readingList,
      }),
      loadLatestTutorHistory({
        domain: options.domain,
        repository: options.repositories.tutorSessions,
      }),
    ]);

  return {
    status,
    portraitTimeline,
    evidenceTimeline,
    readingList,
    tutorHistory,
    dashboard: buildLearningDashboardSummary({
      reading: readingList.summary,
      evidence: evidenceTimeline,
      portraits: portraitTimeline,
      loopStatus: status,
    }),
  };
}
