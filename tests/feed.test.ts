import { describe, expect, it, vi } from "vitest";
import {
  buildFeedRecommendationView,
  persistFeedRecommendationView,
  recordFeedRecommendationFeedback,
  type FeedRecommendationItem,
} from "@/features/feed";
import type { DomainLearningSnapshot } from "@/features/dashboard";
import type { LearningEventResult } from "@/features/events";
import type { RankerWeightRepository } from "@/db/rankerWeightRepo";
import type { RecommendationRepository } from "@/db/recommendationRepo";

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

function feedItem(overrides: Partial<FeedRecommendationItem> = {}): FeedRecommendationItem {
  return {
    id: "learn-k8s",
    recommendationId: 12,
    kind: "learn",
    topic: "k8s",
    reason: "test",
    score: 1.2,
    features: {
      interest_match: 1,
      novelty: 0.5,
    },
    ...overrides,
  };
}

function recommendationRepository(): Pick<
  RecommendationRepository,
  "markShown" | "upsertCandidate"
> {
  return {
    markShown: vi.fn(async () => undefined),
    upsertCandidate: vi.fn(async (input) => ({
      ...input,
      id: 12,
      shownAt: null,
      clicked: false,
      dwellSeconds: 0,
      skipped: false,
    })),
  };
}

function learningResult(): LearningEventResult {
  return {
    evidence: {
      id: 1,
      domain: "computer_science",
      type: "reco_click",
      summary: "click",
      payload: {},
      createdAt: "2026-06-09T08:00:00.000Z",
      consumedInVersion: null,
    },
    update: {
      status: "skipped",
      reason: "trigger_not_met",
      trigger: {
        shouldRun: false,
        reason: "evidence_count",
        evidenceCount: 1,
      },
      latest: null,
      consumedEvidenceIds: [],
    },
  };
}

function rankerWeightRepository(): RankerWeightRepository {
  return {
    list: vi.fn(async () => []),
    getWeights: vi.fn(async () => ({
      interest_match: 1.4,
      novelty: 0.6,
    })),
    upsertMany: vi.fn(async () => undefined),
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

  it("uses learned weights when ranking feed items", () => {
    const view = buildFeedRecommendationView({
      snapshot: snapshot({
        readingList: {
          items: [
            {
              id: 12,
              title: "Explore later",
              kind: "doc",
              status: "later",
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
              done: 0,
              later: 1,
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
              content: "Mentioned topic",
              domain: "computer_science",
              createdAt: "2026-06-09T08:05:00.000Z",
              evidenceId: null,
            },
          ],
        },
      }),
      weights: {
        interest_match: 0,
        adjacency: 0,
        mentioned: 0,
        difficulty_fit: 0,
        novelty: 5,
      },
    });

    expect(view.items[0].topic).toBe("Explore later");
    expect(view.items[0].score).toBeGreaterThan(view.items[1].score);
  });
});

describe("recordFeedRecommendationFeedback", () => {
  it("records click evidence and updates ranker weights", async () => {
    const result = learningResult();
    const learningEvents = {
      recordRecommendationClick: vi.fn(async () => result),
      recordRecommendationSkip: vi.fn(async () => result),
    };
    const rankerWeights = rankerWeightRepository();

    const feedback = await recordFeedRecommendationFeedback({
      domain: "computer_science",
      item: feedItem(),
      kind: "click",
      dwellSeconds: 120,
      learningEvents,
      rankerWeights,
      now: () => "2026-06-09T09:00:00.000Z",
    });

    expect(learningEvents.recordRecommendationClick).toHaveBeenCalledWith({
      domain: "computer_science",
      topic: "k8s",
      recommendationId: 12,
      dwellSeconds: 120,
    });
    expect(learningEvents.recordRecommendationSkip).not.toHaveBeenCalled();
    expect(rankerWeights.upsertMany).toHaveBeenCalledWith(
      expect.objectContaining({
        interest_match: expect.any(Number),
        novelty: expect.any(Number),
      }),
      "2026-06-09T09:00:00.000Z",
    );
    expect(feedback.learning).toBe(result);
    expect(feedback.updatedAt).toBe("2026-06-09T09:00:00.000Z");
    expect(feedback.weights.interest_match).toBeGreaterThan(1.4);
  });

  it("records skip evidence and decreases active feature weights", async () => {
    const result = learningResult();
    const learningEvents = {
      recordRecommendationClick: vi.fn(async () => result),
      recordRecommendationSkip: vi.fn(async () => result),
    };
    const rankerWeights = rankerWeightRepository();

    const feedback = await recordFeedRecommendationFeedback({
      domain: "computer_science",
      item: feedItem(),
      kind: "skip",
      learningEvents,
      rankerWeights,
      now: () => "2026-06-09T09:00:00.000Z",
    });

    expect(learningEvents.recordRecommendationSkip).toHaveBeenCalledWith({
      domain: "computer_science",
      topic: "k8s",
      recommendationId: 12,
    });
    expect(learningEvents.recordRecommendationClick).not.toHaveBeenCalled();
    expect(feedback.weights.interest_match).toBeLessThan(1.4);
  });
});

describe("persistFeedRecommendationView", () => {
  it("persists feed items and attaches recommendation ids", async () => {
    const repository = recommendationRepository();
    const view = {
      items: [
        feedItem({
          recommendationId: null,
          kind: "read",
          topic: "K8s intro",
          score: 1.1,
        }),
      ],
      sourceCounts: {
        topicSeeds: 0,
        readingSeeds: 1,
      },
      emptyReason: null,
    };

    const persisted = await persistFeedRecommendationView({
      domain: "computer_science",
      view,
      repository,
      now: () => "2026-06-09T09:00:00.000Z",
    });

    expect(repository.upsertCandidate).toHaveBeenCalledWith({
      domain: "computer_science",
      kind: "read",
      topic: "K8s intro",
      reason: "test",
      features: {
        interest_match: 1,
        novelty: 0.5,
      },
      score: 1.1,
    });
    expect(repository.markShown).toHaveBeenCalledWith(
      12,
      "2026-06-09T09:00:00.000Z",
    );
    expect(persisted.items[0].recommendationId).toBe(12);
  });
});
