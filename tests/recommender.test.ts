import { describe, expect, it } from "vitest";
import {
  buildRecommendationCandidates,
  DEFAULT_RECOMMENDER_WEIGHTS,
  rankRecommendations,
  scoreRecommendation,
  updateRecommendationWeights,
} from "@/core/recommender";
import type { Recommendation } from "@/types/recommendation";

function candidate(
  topic: string,
  features: Recommendation["features"],
): Recommendation {
  return {
    kind: "learn",
    topic,
    features,
    score: 0,
    shownAt: null,
    clicked: false,
    dwellSeconds: 0,
    skipped: false,
  };
}

describe("recommender ranker", () => {
  it("scores candidates with default feature weights", () => {
    const item = candidate("k8s", {
      interest_match: 0.8,
      mentioned: 1,
      novelty: 0.5,
    });

    expect(scoreRecommendation(item)).toBeCloseTo(
      0.8 * DEFAULT_RECOMMENDER_WEIGHTS.interest_match +
        DEFAULT_RECOMMENDER_WEIGHTS.mentioned +
        0.5 * DEFAULT_RECOMMENDER_WEIGHTS.novelty,
    );
  });

  it("sorts by computed score and writes ranks", () => {
    const ranked = rankRecommendations({
      candidates: [
        candidate("novel topic", { novelty: 1 }),
        candidate("mentioned topic", { mentioned: 1, interest_match: 0.8 }),
        candidate("adjacent topic", { adjacency: 0.9, difficulty_fit: 0.8 }),
      ],
    });

    expect(ranked.map((item) => item.topic)).toEqual([
      "mentioned topic",
      "adjacent topic",
      "novel topic",
    ]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it("keeps input order when scores tie", () => {
    const ranked = rankRecommendations({
      candidates: [
        candidate("first", { interest_match: 0.5 }),
        candidate("second", { interest_match: 0.5 }),
      ],
    });

    expect(ranked.map((item) => item.topic)).toEqual(["first", "second"]);
  });

  it("can boost novelty for exploration", () => {
    const ranked = rankRecommendations({
      candidates: [
        candidate("known", { interest_match: 0.9 }),
        candidate("explore", { novelty: 1 }),
      ],
      noveltyBoost: 1,
    });

    expect(ranked[0].topic).toBe("explore");
  });

  it("increases active feature weights after clicks", () => {
    const next = updateRecommendationWeights({
      recommendation: candidate("k8s", {
        interest_match: 1,
        novelty: 0.5,
      }),
      feedback: { kind: "click", dwellSeconds: 0 },
    });

    expect(next.interest_match).toBeGreaterThan(
      DEFAULT_RECOMMENDER_WEIGHTS.interest_match,
    );
    expect(next.novelty).toBeGreaterThan(DEFAULT_RECOMMENDER_WEIGHTS.novelty);
    expect(next.adjacency).toBe(DEFAULT_RECOMMENDER_WEIGHTS.adjacency);
  });

  it("gives long dwell clicks stronger positive updates", () => {
    const item = candidate("k8s", { interest_match: 1 });
    const shortDwell = updateRecommendationWeights({
      recommendation: item,
      feedback: { kind: "click", dwellSeconds: 0 },
    });
    const longDwell = updateRecommendationWeights({
      recommendation: item,
      feedback: { kind: "click", dwellSeconds: 90 },
    });

    expect(longDwell.interest_match).toBeGreaterThan(shortDwell.interest_match);
  });

  it("decreases active feature weights after skips", () => {
    const next = updateRecommendationWeights({
      recommendation: candidate("too easy", {
        difficulty_fit: 1,
        mentioned: 0.5,
      }),
      feedback: { kind: "skip" },
    });

    expect(next.difficulty_fit).toBeLessThan(
      DEFAULT_RECOMMENDER_WEIGHTS.difficulty_fit,
    );
    expect(next.mentioned).toBeLessThan(DEFAULT_RECOMMENDER_WEIGHTS.mentioned);
  });

  it("clamps learned weights to configured bounds", () => {
    const next = updateRecommendationWeights({
      recommendation: candidate("novel", { novelty: 1 }),
      feedback: { kind: "click", dwellSeconds: 90 },
      weights: { novelty: 0.98 },
      learningRate: 0.1,
      maxWeight: 1,
    });

    expect(next.novelty).toBe(1);
  });

  it("builds learn candidates from topic seeds", () => {
    const candidates = buildRecommendationCandidates({
      domain: "computer_science",
      topics: [
        {
          topic: "k8s networking",
          source: "portrait_next_focus",
          reason: "next focus",
        },
        {
          topic: "container basics",
          source: "recent_topic",
          strength: 0.9,
        },
      ],
    });

    expect(candidates.map((item) => item.kind)).toEqual(["learn", "learn"]);
    expect(candidates.map((item) => item.topic)).toContain("k8s networking");
    expect(candidates[0].score).toBeGreaterThan(0);
  });

  it("builds read candidates from unfinished reading list items", () => {
    const candidates = buildRecommendationCandidates({
      domain: "computer_science",
      readings: [
        { title: "K8s intro", status: "todo" },
        { title: "Finished doc", status: "done" },
        { title: "Advanced lab", status: "later" },
      ],
    });

    expect(candidates.map((item) => item.kind)).toEqual(["read", "read"]);
    expect(candidates.map((item) => item.topic)).not.toContain("Finished doc");
  });

  it("filters blank seeds and deduplicates by kind and topic", () => {
    const candidates = buildRecommendationCandidates({
      domain: "computer_science",
      topics: [
        { topic: "  ", source: "manual" },
        { topic: "K8s", source: "manual", features: { novelty: 0.2 } },
        { topic: " k8s ", source: "recent_topic", features: { novelty: 0.8 } },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].topic).toBe("K8s");
    expect(candidates[0].features.novelty).toBe(0.8);
    expect(candidates[0].features.mentioned).toBe(1);
  });

  it("returns ranked candidates within the requested limit", () => {
    const candidates = buildRecommendationCandidates({
      domain: "computer_science",
      limit: 2,
      topics: [
        { topic: "low", source: "manual" },
        { topic: "high", source: "recent_topic", strength: 1 },
      ],
      readings: [{ title: "read me", status: "reading" }],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[1].score);
  });
});
