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

export type RecommendationFeedbackKind = "click" | "skip";

export interface RecommendationFeedbackInput {
  kind: RecommendationFeedbackKind;
  dwellSeconds?: number;
}

export interface UpdateRecommendationWeightsOptions {
  recommendation: Recommendation;
  feedback: RecommendationFeedbackInput;
  weights?: RecommenderWeights;
  learningRate?: number;
  strongDwellSeconds?: number;
  minWeight?: number;
  maxWeight?: number;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function feedbackReward(
  feedback: RecommendationFeedbackInput,
  strongDwellSeconds: number,
): number {
  if (feedback.kind === "skip") {
    return -1;
  }
  const dwell = Math.max(0, feedback.dwellSeconds ?? 0);
  return 1 + Math.min(1, dwell / strongDwellSeconds);
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

export function updateRecommendationWeights({
  recommendation,
  feedback,
  weights,
  learningRate = 0.08,
  strongDwellSeconds = 90,
  minWeight = 0,
  maxWeight = 3,
}: UpdateRecommendationWeightsOptions): Record<RecoFeatureKey, number> {
  const reward = feedbackReward(feedback, strongDwellSeconds);
  return RECO_FEATURE_KEYS.reduce(
    (nextWeights, key) => {
      const currentWeight = weightFor(weights, key);
      const delta = learningRate * featureValue(recommendation, key) * reward;
      return {
        ...nextWeights,
        [key]: roundScore(clamp(currentWeight + delta, minWeight, maxWeight)),
      };
    },
    {} as Record<RecoFeatureKey, number>,
  );
}
