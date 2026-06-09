import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECOMMENDER_WEIGHTS,
  rankRecommendations,
  scoreRecommendation,
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
});
