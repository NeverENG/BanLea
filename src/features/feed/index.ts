import {
  buildRecommendationCandidates,
  updateRecommendationWeights,
  type RecommenderWeights,
  type RecommendationReadingSeed,
  type RecommendationTopicSeed,
} from "@/core/recommender";
import type { RankerWeightRepository } from "@/db/rankerWeightRepo";
import type { RecommendationRepository } from "@/db/recommendationRepo";
import type { DomainLearningSnapshot } from "@/features/dashboard";
import type { LearningEventResult, LearningEventService } from "@/features/events";
import {
  buildOnboardingSeedProfileFromEvidence,
  type OnboardingSeedProfile,
} from "@/features/onboarding";
import type { Recommendation } from "@/types/recommendation";

export interface FeedRecommendationItem {
  id: string;
  recommendationId: number | null;
  kind: Recommendation["kind"];
  topic: string;
  reason: string;
  score: number;
  features: Recommendation["features"];
}

export interface FeedRecommendationViewModel {
  items: FeedRecommendationItem[];
  sourceCounts: {
    topicSeeds: number;
    readingSeeds: number;
  };
  emptyReason: string | null;
}

export interface BuildFeedRecommendationViewOptions {
  snapshot: DomainLearningSnapshot;
  limit?: number;
  recentMessageLimit?: number;
  weights?: RecommenderWeights;
  onboarding?: OnboardingSeedProfile | null;
}

export interface PersistFeedRecommendationViewOptions {
  domain: string;
  view: FeedRecommendationViewModel;
  repository: Pick<RecommendationRepository, "markShown" | "upsertCandidate">;
  now?: () => string;
}

export type FeedRecommendationFeedbackKind = "click" | "skip";

export interface RecordFeedRecommendationFeedbackOptions {
  domain: string;
  item: FeedRecommendationItem;
  kind: FeedRecommendationFeedbackKind;
  learningEvents: Pick<
    LearningEventService,
    "recordRecommendationClick" | "recordRecommendationSkip"
  >;
  rankerWeights: RankerWeightRepository;
  recommendations?: Pick<RecommendationRepository, "markClicked" | "markSkipped">;
  dwellSeconds?: number;
  now?: () => string;
}

export interface FeedRecommendationFeedbackResult {
  learning: LearningEventResult;
  weights: Awaited<ReturnType<RankerWeightRepository["getWeights"]>>;
  updatedAt: string;
}

const defaultNow = () => new Date().toISOString();

function compactIdPart(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function recentUserTopicSeeds(
  snapshot: DomainLearningSnapshot,
  limit: number,
): RecommendationTopicSeed[] {
  return snapshot.tutorHistory.messages
    .filter((message) => message.role === "user")
    .slice(-limit)
    .map((message) => ({
      topic: message.content,
      source: "recent_topic",
      reason: "来自近期提问",
      strength: 0.8,
    }));
}

function portraitTopicSeeds(
  snapshot: DomainLearningSnapshot,
): RecommendationTopicSeed[] {
  const portrait = snapshot.status.latest?.portrait;
  if (!portrait) {
    return [];
  }

  const seeds: RecommendationTopicSeed[] = [];
  if (portrait.nextFocus) {
    seeds.push({
      topic: portrait.nextFocus,
      source: "portrait_next_focus",
      reason: "来自画像下一步建议",
      strength: portrait.confidence,
    });
  }

  for (const key of ["gaps", "misconceptions"] as const) {
    const dimension = portrait.dimensions[key];
    if (dimension?.summary) {
      seeds.push({
        topic: dimension.summary,
        source: "portrait_gap",
        reason: `来自画像维度 ${key}`,
        strength: dimension.confidence,
      });
    }
  }

  return seeds;
}

function readingSeeds(snapshot: DomainLearningSnapshot): RecommendationReadingSeed[] {
  return snapshot.readingList.items.map((item) => ({
    title: item.title,
    status: item.status,
    reason: "来自待读书单",
  }));
}

function toFeedItem(candidate: Recommendation, index: number): FeedRecommendationItem {
  return {
    id: `${candidate.kind}-${compactIdPart(candidate.topic) || index}`,
    recommendationId: candidate.id ?? null,
    kind: candidate.kind,
    topic: candidate.topic,
    reason: candidate.reason ?? "基于当前学习状态生成",
    score: candidate.score,
    features: candidate.features,
  };
}

function feedItemToRecommendation(item: FeedRecommendationItem): Recommendation {
  return {
    domain: "global",
    kind: item.kind,
    topic: item.topic,
    reason: item.reason,
    features: item.features,
    score: item.score,
    shownAt: null,
    clicked: false,
    dwellSeconds: 0,
    skipped: false,
  };
}

export function buildFeedRecommendationView({
  snapshot,
  limit = 8,
  recentMessageLimit = 3,
  weights,
  onboarding,
}: BuildFeedRecommendationViewOptions): FeedRecommendationViewModel {
  const evidenceOnboarding = buildOnboardingSeedProfileFromEvidence(
    snapshot.evidenceTimeline,
  );
  const topicSeeds = [
    ...(onboarding?.topicSeeds ?? []),
    ...evidenceOnboarding.topicSeeds,
    ...portraitTopicSeeds(snapshot),
    ...recentUserTopicSeeds(snapshot, recentMessageLimit),
  ];
  const readings = readingSeeds(snapshot);
  const candidates = buildRecommendationCandidates({
    domain: snapshot.status.domain,
    topics: topicSeeds,
    readings,
    limit,
    weights,
    noveltyBoost: 0.2,
  });
  const items = candidates.map(toFeedItem);

  return {
    items,
    sourceCounts: {
      topicSeeds: topicSeeds.length,
      readingSeeds: readings.length,
    },
    emptyReason:
      items.length === 0
        ? "暂无画像、近期提问或未完成书单可用于生成推荐"
        : null,
  };
}

export async function recordFeedRecommendationFeedback({
  domain,
  item,
  kind,
  learningEvents,
  rankerWeights,
  recommendations,
  dwellSeconds,
  now = defaultNow,
}: RecordFeedRecommendationFeedbackOptions): Promise<FeedRecommendationFeedbackResult> {
  const currentWeights = await rankerWeights.getWeights();
  const weights = updateRecommendationWeights({
    recommendation: feedItemToRecommendation(item),
    feedback:
      kind === "click"
        ? { kind: "click", dwellSeconds }
        : { kind: "skip" },
    weights: currentWeights,
  });
  const updatedAt = now();
  const learning =
    kind === "click"
      ? await learningEvents.recordRecommendationClick({
          domain,
          topic: item.topic,
          recommendationId: item.recommendationId ?? undefined,
          dwellSeconds,
        })
      : await learningEvents.recordRecommendationSkip({
          domain,
          topic: item.topic,
          recommendationId: item.recommendationId ?? undefined,
        });

  if (typeof item.recommendationId === "number" && recommendations) {
    if (kind === "click") {
      await recommendations.markClicked(item.recommendationId, dwellSeconds ?? 0);
    } else {
      await recommendations.markSkipped(item.recommendationId);
    }
  }

  await rankerWeights.upsertMany(weights, updatedAt);

  return {
    learning,
    weights,
    updatedAt,
  };
}

export async function persistFeedRecommendationView({
  domain,
  view,
  repository,
  now = defaultNow,
}: PersistFeedRecommendationViewOptions): Promise<FeedRecommendationViewModel> {
  const shownAt = now();
  const items = await Promise.all(
    view.items.map(async (item) => {
      const saved = await repository.upsertCandidate({
        domain,
        kind: item.kind,
        topic: item.topic,
        reason: item.reason,
        features: item.features,
        score: item.score,
      });

      if (typeof saved.id === "number") {
        await repository.markShown(saved.id, shownAt);
      }

      return {
        ...item,
        recommendationId: saved.id ?? null,
      };
    }),
  );

  return {
    ...view,
    items,
  };
}
