import type { RecommendationTopicSeed } from "@/core/recommender";
import type { EvidenceTimelineItem } from "@/features/evidence";

export const ONBOARDING_DIMENSION_HINTS = [
  "goal_orientation",
  "interest",
  "curiosity_breadth",
  "resource_preference",
] as const;

export interface OnboardingAnswer {
  statement: string;
  dimensionHints?: string[];
  confidenceScore?: number;
}

export interface OnboardingSeedProfile {
  topicSeeds: RecommendationTopicSeed[];
  dimensionHints: string[];
}

const DEFAULT_ONBOARDING_STRENGTH = 0.72;

function normalizeStatement(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function payloadString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function payloadStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function payloadNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function buildOnboardingSeedProfile(
  answers: OnboardingAnswer[],
  limit = 5,
): OnboardingSeedProfile {
  const seen = new Set<string>();
  const dimensionHints = new Set<string>();
  const topicSeeds: RecommendationTopicSeed[] = [];

  for (const answer of answers) {
    const topic = normalizeStatement(answer.statement);
    const key = topic.toLocaleLowerCase();
    if (!topic || seen.has(key)) {
      continue;
    }

    seen.add(key);
    for (const hint of ONBOARDING_DIMENSION_HINTS) {
      dimensionHints.add(hint);
    }
    for (const hint of answer.dimensionHints ?? []) {
      dimensionHints.add(hint);
    }

    const strength = clamp01(answer.confidenceScore ?? DEFAULT_ONBOARDING_STRENGTH);
    topicSeeds.push({
      topic,
      source: "manual",
      reason: "来自冷启动自评",
      strength,
      features: {
        interest_match: strength,
        difficulty_fit: 0.6,
        novelty: 0.7,
      },
    });

    if (topicSeeds.length >= limit) {
      break;
    }
  }

  return {
    topicSeeds,
    dimensionHints: Array.from(dimensionHints),
  };
}

export function buildOnboardingSeedProfileFromEvidence(
  evidenceTimeline: EvidenceTimelineItem[],
  limit = 5,
): OnboardingSeedProfile {
  const answers = evidenceTimeline.flatMap((item): OnboardingAnswer[] => {
    if (item.type !== "self_report") {
      return [];
    }

    const statement =
      payloadString(item.payload.statement) ??
      payloadString(item.payload.content) ??
      normalizeStatement(item.summary);

    if (!statement) {
      return [];
    }

    return [
      {
        statement,
        dimensionHints: payloadStringArray(item.payload.dimensionHints),
        confidenceScore: payloadNumber(item.payload.confidenceScore),
      },
    ];
  });

  return buildOnboardingSeedProfile(answers, limit);
}
