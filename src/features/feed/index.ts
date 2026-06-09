import {
  buildRecommendationCandidates,
  type RecommendationReadingSeed,
  type RecommendationTopicSeed,
} from "@/core/recommender";
import type { DomainLearningSnapshot } from "@/features/dashboard";
import type { Recommendation } from "@/types/recommendation";

export interface FeedRecommendationItem {
  id: string;
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
}

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
    kind: candidate.kind,
    topic: candidate.topic,
    reason: candidate.reason ?? "基于当前学习状态生成",
    score: candidate.score,
    features: candidate.features,
  };
}

export function buildFeedRecommendationView({
  snapshot,
  limit = 8,
  recentMessageLimit = 3,
}: BuildFeedRecommendationViewOptions): FeedRecommendationViewModel {
  const topicSeeds = [
    ...portraitTopicSeeds(snapshot),
    ...recentUserTopicSeeds(snapshot, recentMessageLimit),
  ];
  const readings = readingSeeds(snapshot);
  const candidates = buildRecommendationCandidates({
    domain: snapshot.status.domain,
    topics: topicSeeds,
    readings,
    limit,
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
