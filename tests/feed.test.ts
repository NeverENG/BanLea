import { describe, expect, it } from "vitest";
import { buildFeedRecommendationView } from "@/features/feed";
import type { DomainLearningSnapshot } from "@/features/dashboard";

function snapshot(
  overrides: Partial<DomainLearningSnapshot> = {},
): DomainLearningSnapshot {
  const base: DomainLearningSnapshot = {
    status: {
      domain: "computer_science",
      latest: null,
      portraitVersion: null,
      portraitConfidence: null,
      portraitUpdatedAt: null,
      changeSummary: null,
      unconsumedEvidenceCount: 0,
      trigger: {
        shouldRun: false,
        reason: "no_evidence",
        evidenceCount: 0,
      },
    },
    portraitTimeline: [],
    evidenceTimeline: [],
    readingList: {
      items: [],
      groups: [],
      summary: {
        total: 0,
        byStatus: {
          todo: 0,
          reading: 0,
          done: 0,
          later: 0,
        },
        doneDwellSeconds: 0,
      },
    },
    tutorHistory: {
      session: null,
      messages: [],
    },
    dashboard: {
      totalResources: 0,
      doneResources: 0,
      laterResources: 0,
      doneDwellSeconds: 0,
      evidenceCount: 0,
      pendingEvidenceCount: 0,
      consumedEvidenceCount: 0,
      latestPortraitVersion: null,
      latestPortraitConfidence: null,
      portraitVersionCount: 0,
      lastActivityAt: null,
    },
  };

  return {
    ...base,
    ...overrides,
    status: {
      ...base.status,
      ...overrides.status,
    },
    readingList: {
      ...base.readingList,
      ...overrides.readingList,
    },
    tutorHistory: {
      ...base.tutorHistory,
      ...overrides.tutorHistory,
    },
  };
}

describe("buildFeedRecommendationView", () => {
  it("builds feed items from portrait, recent user messages, and reading list", () => {
    const view = buildFeedRecommendationView({
      snapshot: snapshot({
        status: {
          latest: {
            id: 1,
            domainId: "computer_science",
            version: 2,
            confidence: 0.82,
            createdAt: "2026-06-09T08:00:00.000Z",
            changeSummary: "updated",
            portrait: {
              scope: "domain",
              domain: "computer_science",
              portraitVersion: 2,
              updatedAt: "2026-06-09T08:00:00.000Z",
              confidence: 0.82,
              nextFocus: "k8s networking",
              dimensions: {
                gaps: {
                  summary: "service discovery",
                  confidence: 0.7,
                  evidenceIds: [1],
                },
              },
            },
          },
          portraitVersion: 2,
          portraitConfidence: 0.82,
        },
        readingList: {
          items: [
            {
              id: 10,
              title: "K8s intro",
              kind: "doc",
              status: "todo",
              url: null,
              addedAt: "2026-06-09T08:10:00.000Z",
            },
          ],
          groups: [],
          summary: {
            total: 1,
            byStatus: {
              todo: 1,
              reading: 0,
              done: 0,
              later: 0,
            },
            doneDwellSeconds: 0,
          },
        },
        tutorHistory: {
          session: null,
          messages: [
            {
              id: "u1",
              role: "user",
              content: "pod lifecycle",
              domain: "computer_science",
              createdAt: "2026-06-09T08:05:00.000Z",
              evidenceId: null,
            },
          ],
        },
      }),
    });

    expect(view.items.map((item) => item.topic)).toEqual(
      expect.arrayContaining([
        "k8s networking",
        "service discovery",
        "pod lifecycle",
        "K8s intro",
      ]),
    );
    expect(view.sourceCounts).toEqual({
      topicSeeds: 3,
      readingSeeds: 1,
    });
    expect(view.emptyReason).toBeNull();
  });

  it("ignores assistant messages and completed reading items", () => {
    const view = buildFeedRecommendationView({
      snapshot: snapshot({
        readingList: {
          items: [
            {
              id: 11,
              title: "Finished doc",
              kind: "doc",
              status: "done",
              url: null,
              addedAt: "2026-06-09T08:10:00.000Z",
            },
          ],
          groups: [],
          summary: {
            total: 1,
            byStatus: {
              todo: 0,
              reading: 0,
              done: 1,
              later: 0,
            },
            doneDwellSeconds: 120,
          },
        },
        tutorHistory: {
          session: null,
          messages: [
            {
              id: "a1",
              role: "assistant",
              content: "assistant answer",
              domain: "computer_science",
              createdAt: "2026-06-09T08:05:00.000Z",
              evidenceId: null,
            },
          ],
        },
      }),
    });

    expect(view.items).toEqual([]);
    expect(view.emptyReason).toBe("暂无画像、近期提问或未完成书单可用于生成推荐");
  });

  it("respects recent message and output limits", () => {
    const view = buildFeedRecommendationView({
      snapshot: snapshot({
        tutorHistory: {
          session: null,
          messages: [
            {
              id: "u1",
              role: "user",
              content: "first",
              domain: "computer_science",
              createdAt: "2026-06-09T08:01:00.000Z",
              evidenceId: null,
            },
            {
              id: "u2",
              role: "user",
              content: "second",
              domain: "computer_science",
              createdAt: "2026-06-09T08:02:00.000Z",
              evidenceId: null,
            },
          ],
        },
      }),
      recentMessageLimit: 1,
      limit: 1,
    });

    expect(view.items).toHaveLength(1);
    expect(view.items[0].topic).toBe("second");
    expect(view.sourceCounts.topicSeeds).toBe(1);
  });
});
