import {
  RECO_FEATURE_KEYS,
  type RecoFeatureKey,
  type Recommendation,
} from "@/types/recommendation";

export type RecommenderWeights = Partial<Record<RecoFeatureKey, number>>;

export interface RankRecommendationsOptions {
  candidates: Recommendation[];
  weights?: RecommenderWeights;
  noveltyBoost?: number;
}

export interface RankedRecommendation extends Recommendation {
  rank: number;
}

export const DEFAULT_RECOMMENDER_WEIGHTS: Record<RecoFeatureKey, number> = {
  interest_match: 1.4,
  adjacency: 1,
  mentioned: 1.2,
  difficulty_fit: 0.8,
  novelty: 0.6,
};

function featureValue(candidate: Recommendation, key: RecoFeatureKey): number {
  const value = candidate.features[key] ?? 0;
  return Math.min(1, Math.max(0, value));
}

function weightFor(weights: RecommenderWeights | undefined, key: RecoFeatureKey): number {
  return weights?.[key] ?? DEFAULT_RECOMMENDER_WEIGHTS[key];
}

function roundScore(score: number): number {
  return Math.round(score * 1_000_000) / 1_000_000;
}

export function scoreRecommendation(
  candidate: Recommendation,
  weights?: RecommenderWeights,
  noveltyBoost = 0,
): number {
  const weightedScore = RECO_FEATURE_KEYS.reduce(
    (total, key) => total + featureValue(candidate, key) * weightFor(weights, key),
    0,
  );
  return roundScore(weightedScore + featureValue(candidate, "novelty") * noveltyBoost);
}

export function rankRecommendations({
  candidates,
  weights,
  noveltyBoost = 0,
}: RankRecommendationsOptions): RankedRecommendation[] {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      score: scoreRecommendation(candidate, weights, noveltyBoost),
      originalIndex: index,
    }))
    .sort((left, right) => {
      const scoreOrder = right.score - left.score;
      return scoreOrder === 0 ? left.originalIndex - right.originalIndex : scoreOrder;
    })
    .map(({ originalIndex: _originalIndex, ...candidate }, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}
