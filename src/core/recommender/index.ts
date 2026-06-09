import {
  RECO_FEATURE_KEYS,
  type RecoFeatures,
  type RecoFeatureKey,
  type RecommendationKind,
  type Recommendation,
} from "@/types/recommendation";
import type { ReadingListStatus } from "@/types/readingList";

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

export type RecommendationTopicSeedSource =
  | "portrait_next_focus"
  | "portrait_gap"
  | "recent_topic"
  | "manual";

export interface RecommendationTopicSeed {
  topic: string;
  source: RecommendationTopicSeedSource;
  reason?: string;
  strength?: number;
  features?: RecoFeatures;
}

export interface RecommendationReadingSeed {
  title: string;
  status: ReadingListStatus;
  reason?: string;
  features?: RecoFeatures;
}

export interface BuildRecommendationCandidatesOptions {
  domain: string;
  topics?: RecommendationTopicSeed[];
  readings?: RecommendationReadingSeed[];
  limit?: number;
  weights?: RecommenderWeights;
  noveltyBoost?: number;
}

export const DEFAULT_RECOMMENDER_WEIGHTS: Record<RecoFeatureKey, number> = {
  interest_match: 1.4,
  adjacency: 1,
  mentioned: 1.2,
  difficulty_fit: 0.8,
  novelty: 0.6,
};

const DEFAULT_CANDIDATE_LIMIT = 12;

const TOPIC_SOURCE_FEATURES: Record<RecommendationTopicSeedSource, RecoFeatures> = {
  portrait_next_focus: {
    interest_match: 0.8,
    adjacency: 0.9,
    difficulty_fit: 0.75,
    novelty: 0.35,
  },
  portrait_gap: {
    interest_match: 0.65,
    adjacency: 0.7,
    difficulty_fit: 0.85,
    novelty: 0.45,
  },
  recent_topic: {
    interest_match: 0.75,
    adjacency: 0.6,
    mentioned: 1,
    novelty: 0.25,
  },
  manual: {
    interest_match: 0.6,
    difficulty_fit: 0.65,
    novelty: 0.5,
  },
};

const READING_STATUS_FEATURES: Record<
  Exclude<ReadingListStatus, "done">,
  RecoFeatures
> = {
  reading: {
    interest_match: 0.9,
    mentioned: 0.6,
    difficulty_fit: 0.75,
    novelty: 0.2,
  },
  todo: {
    interest_match: 0.75,
    mentioned: 0.45,
    difficulty_fit: 0.7,
    novelty: 0.35,
  },
  later: {
    interest_match: 0.5,
    mentioned: 0.25,
    difficulty_fit: 0.6,
    novelty: 0.75,
  },
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

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

function candidateKey(kind: RecommendationKind, topic: string): string {
  return `${kind}:${topic.toLocaleLowerCase()}`;
}

function mergeFeatures(left: RecoFeatures, right: RecoFeatures): RecoFeatures {
  return RECO_FEATURE_KEYS.reduce((features, key) => {
    const value = Math.max(left[key] ?? 0, right[key] ?? 0);
    return value > 0 ? { ...features, [key]: value } : features;
  }, {} as RecoFeatures);
}

function recommendationCandidate(
  kind: RecommendationKind,
  topic: string,
  reason: string | undefined,
  features: RecoFeatures,
): Recommendation {
  return {
    kind,
    topic,
    reason,
    features,
    score: 0,
    shownAt: null,
    clicked: false,
    dwellSeconds: 0,
    skipped: false,
  };
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

export function buildRecommendationCandidates({
  topics = [],
  readings = [],
  limit = DEFAULT_CANDIDATE_LIMIT,
  weights,
  noveltyBoost,
}: BuildRecommendationCandidatesOptions): Recommendation[] {
  const candidates = new Map<string, Recommendation>();

  function addCandidate(candidate: Recommendation) {
    const key = candidateKey(candidate.kind, candidate.topic);
    const existing = candidates.get(key);
    if (!existing) {
      candidates.set(key, candidate);
      return;
    }

    candidates.set(key, {
      ...existing,
      reason: existing.reason ?? candidate.reason,
      features: mergeFeatures(existing.features, candidate.features),
    });
  }

  for (const seed of topics) {
    const topic = normalizeTopic(seed.topic);
    if (!topic) {
      continue;
    }
    addCandidate(
      recommendationCandidate(
        "learn",
        topic,
        seed.reason,
        mergeFeatures(TOPIC_SOURCE_FEATURES[seed.source], {
          ...seed.features,
          interest_match: seed.strength ?? seed.features?.interest_match,
        }),
      ),
    );
  }

  for (const seed of readings) {
    const topic = normalizeTopic(seed.title);
    if (!topic || seed.status === "done") {
      continue;
    }
    addCandidate(
      recommendationCandidate(
        "read",
        topic,
        seed.reason,
        mergeFeatures(READING_STATUS_FEATURES[seed.status], seed.features ?? {}),
      ),
    );
  }

  return rankRecommendations({
    candidates: Array.from(candidates.values()),
    weights,
    noveltyBoost,
  })
    .slice(0, limit)
    .map(({ rank: _rank, ...candidate }) => candidate);
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
