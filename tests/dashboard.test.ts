import { describe, expect, it } from "vitest";
import {
  buildLearningDashboardSummary,
  loadDomainLearningSnapshot,
} from "@/features/dashboard";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { PortraitRepository, PortraitVersionRecord } from "@/db/portraitRepo";
import type { ReadingListRepository } from "@/db/readingListRepo";
import type { TutorSessionRepository } from "@/db/tutorSessionRepo";
import type { Evidence } from "@/types/evidence";
import type { EvidenceTimelineItem } from "@/features/evidence";
import type { LearningLoopStatus } from "@/features/events";
import type { PortraitTimelineItem } from "@/features/portrait";
import type { ReadingListSummary } from "@/features/reading-list";
import type { ReadingListItem } from "@/types/readingList";

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
    payload: {},
    createdAt: "2026-06-09T08:00:00.000Z",
    consumedInVersion: null,
    status: "pending",
  },
  {
    id: 2,
    type: "reading",
    summary: "reading",
    payload: {},
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
    dimensions: {},
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

describe("loadDomainLearningSnapshot", () => {
  it("loads the full domain dashboard snapshot from repositories", async () => {
    const domain = "computer_science";
    const evidenceRows: Evidence[] = [
      {
        id: 1,
        domain,
        type: "chat",
        summary: "chat evidence",
        payload: {},
        createdAt: "2026-06-09T08:00:00.000Z",
        consumedInVersion: null,
      },
      {
        id: 2,
        domain,
        type: "reading",
        summary: "reading evidence",
        payload: {},
        createdAt: "2026-06-09T08:05:00.000Z",
        consumedInVersion: 2,
      },
    ];
    const portraitRecord: PortraitVersionRecord = {
      id: 7,
      domainId: domain,
      version: 2,
      confidence: 0.81,
      createdAt: "2026-06-09T08:10:00.000Z",
      changeSummary: "stronger mastery signal",
      portrait: {
        scope: "domain",
        domain,
        portraitVersion: 2,
        updatedAt: "2026-06-09T08:10:00.000Z",
        confidence: 0.81,
        dimensions: {
          mastery: {
            summary: "can explain basics",
            confidence: 0.75,
            evidenceIds: [1, 2],
          },
        },
        changeSummary: "stronger mastery signal",
        nextFocus: "practice",
      },
    };
    const readingRows: ReadingListItem[] = [
      {
        id: 3,
        domain,
        sourceId: "source-1",
        title: "K8s intro",
        url: null,
        kind: "doc",
        status: "done",
        addedAt: "2026-06-09T08:15:00.000Z",
        readAt: "2026-06-09T08:20:00.000Z",
        dwellSeconds: 180,
      },
      {
        id: 4,
        domain,
        sourceId: "source-2",
        title: "K8s lab",
        url: null,
        kind: "article",
        status: "later",
        addedAt: "2026-06-09T08:16:00.000Z",
        readAt: null,
        dwellSeconds: 0,
      },
    ];

    const evidenceRepository: EvidenceRepository = {
      async insert() {
        throw new Error("not used");
      },
      async listUnconsumed(domainId, limit) {
        const rows = evidenceRows.filter(
          (item) => item.domain === domainId && item.consumedInVersion === null,
        );
        return typeof limit === "number" ? rows.slice(0, limit) : rows;
      },
      async listByDomain(domainId) {
        return evidenceRows.filter((item) => item.domain === domainId);
      },
      async markConsumed() {
        return 0;
      },
    };
    const portraitRepository: PortraitRepository = {
      async save() {
        throw new Error("not used");
      },
      async getLatest(domainId) {
        return domainId === domain ? portraitRecord : null;
      },
      async getByVersion() {
        return null;
      },
      async listByDomain(domainId) {
        return domainId === domain ? [portraitRecord] : [];
      },
      async nextVersion() {
        return 3;
      },
    };
    const readingListRepository: ReadingListRepository = {
      async insert() {
        throw new Error("not used");
      },
      async listByDomain(domainId) {
        return readingRows.filter((item) => item.domain === domainId);
      },
      async updateStatus() {
        return null;
      },
    };
    const tutorSessionRepository: TutorSessionRepository = {
      async createSession() {
        throw new Error("not used");
      },
      async getLatestByDomain(domainId) {
        return domainId === domain
          ? {
              id: 9,
              domain,
              title: "K8s",
              createdAt: "2026-06-09T08:30:00.000Z",
              updatedAt: "2026-06-09T08:35:00.000Z",
            }
          : null;
      },
      async touchSession() {},
      async insertMessage() {
        throw new Error("not used");
      },
      async listMessages(sessionId) {
        return sessionId === 9
          ? [
              {
                id: 10,
                sessionId,
                role: "user",
                content: "Explain pods",
                createdAt: "2026-06-09T08:31:00.000Z",
              },
            ]
          : [];
      },
    };

    const snapshot = await loadDomainLearningSnapshot({
      domain,
      repositories: {
        evidence: evidenceRepository,
        portraits: portraitRepository,
        readingList: readingListRepository,
        tutorSessions: tutorSessionRepository,
      },
    });

    expect(snapshot.status.portraitVersion).toBe(2);
    expect(snapshot.portraitTimeline).toHaveLength(1);
    expect(snapshot.evidenceTimeline.map((item) => item.id)).toEqual([2, 1]);
    expect(snapshot.readingList.summary).toEqual({
      total: 2,
      byStatus: {
        todo: 0,
        reading: 0,
        done: 1,
        later: 1,
      },
      doneDwellSeconds: 180,
    });
    expect(snapshot.tutorHistory.messages).toHaveLength(1);
    expect(snapshot.dashboard).toMatchObject({
      totalResources: 2,
      doneResources: 1,
      laterResources: 1,
      evidenceCount: 2,
      pendingEvidenceCount: 1,
      consumedEvidenceCount: 1,
      latestPortraitVersion: 2,
      latestPortraitConfidence: 0.81,
      portraitVersionCount: 1,
      lastActivityAt: "2026-06-09T08:05:00.000Z",
    });
  });
});
