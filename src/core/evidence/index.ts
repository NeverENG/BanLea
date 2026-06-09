import {
  DEFAULT_HARNESS_TRIGGER_POLICY,
  type HarnessTriggerPolicy,
} from "@/config";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { Evidence, NewEvidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

// 证据采集与触发器（§5①②）

export type HarnessTriggerReason =
  | "no_evidence"
  | "first_portrait"
  | "contradiction_signal"
  | "evidence_count"
  | "strong_recommendation_feedback"
  | "low_quiz_score";

export type HarnessTriggerDecision =
  | {
      shouldRun: false;
      reason: "no_evidence";
      evidenceCount: 0;
    }
  | {
      shouldRun: false;
      reason: HarnessTriggerReason;
      evidenceCount: number;
    }
  | {
      shouldRun: true;
      reason: Exclude<HarnessTriggerReason, "no_evidence">;
      evidenceCount: number;
      evidenceIds: number[];
    };

export interface ShouldTriggerHarnessUpdateInput {
  latestPortrait: Portrait | null;
  unconsumedEvidence: Evidence[];
  policy?: HarnessTriggerPolicy;
}

export interface EvidenceCollectorOptions {
  repository: EvidenceRepository;
  now?: () => string;
}

export interface BaseEvidenceEvent {
  domain: string;
  summary?: string;
}

export interface ChatEvidenceEvent extends BaseEvidenceEvent {
  content: string;
  role: "user" | "assistant";
  sessionId?: number;
}

export interface SelfReportEvidenceEvent extends BaseEvidenceEvent {
  statement: string;
  dimensionHints?: string[];
  confidenceScore?: number;
}

export interface QuizEvidenceEvent extends BaseEvidenceEvent {
  topic: string;
  score: number;
  total?: number;
  correct?: number;
}

export interface ReadingEvidenceEvent extends BaseEvidenceEvent {
  title: string;
  url?: string;
  status: "todo" | "reading" | "done" | "later";
  dwellSeconds?: number;
}

export interface RecommendationClickEvidenceEvent extends BaseEvidenceEvent {
  recommendationId?: number;
  topic: string;
  dwellSeconds?: number;
}

export interface RecommendationSkipEvidenceEvent extends BaseEvidenceEvent {
  recommendationId?: number;
  topic: string;
}

export interface EvidenceCollector {
  recordChat(event: ChatEvidenceEvent): Promise<Evidence>;
  recordSelfReport(event: SelfReportEvidenceEvent): Promise<Evidence>;
  recordQuiz(event: QuizEvidenceEvent): Promise<Evidence>;
  recordReading(event: ReadingEvidenceEvent): Promise<Evidence>;
  recordRecommendationClick(event: RecommendationClickEvidenceEvent): Promise<Evidence>;
  recordRecommendationSkip(event: RecommendationSkipEvidenceEvent): Promise<Evidence>;
}

function evidenceIds(evidence: Evidence[]): number[] {
  return evidence.flatMap((item) => (typeof item.id === "number" ? [item.id] : []));
}

function numericPayloadValue(evidence: Evidence, keys: string[]): number | null {
  for (const key of keys) {
    const value = evidence.payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function hasStrongRecommendationFeedback(
  evidence: Evidence[],
  policy: HarnessTriggerPolicy,
): boolean {
  return evidence.some((item) => {
    if (item.type === "reco_skip") {
      return true;
    }
    if (item.type !== "reco_click") {
      return false;
    }
    const dwellSeconds = numericPayloadValue(item, ["dwellSeconds", "dwell_seconds"]);
    return dwellSeconds !== null && dwellSeconds >= policy.strongFeedbackDwellSeconds;
  });
}

function hasLowQuizScore(evidence: Evidence[], policy: HarnessTriggerPolicy): boolean {
  return evidence.some((item) => {
    if (item.type !== "quiz") {
      return false;
    }
    const score = numericPayloadValue(item, ["score", "correctRate", "correct_rate"]);
    return score !== null && score <= policy.lowQuizScore;
  });
}

function textPayloadValue(evidence: Evidence, keys: string[]): string | null {
  for (const key of keys) {
    const value = evidence.payload[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function hasConfidentClaimText(value: string): boolean {
  const normalized = value.toLowerCase();
  const negativeMarkers = [
    "不懂",
    "不会",
    "没懂",
    "没有掌握",
    "没掌握",
    "不熟",
    "confused",
    "don't understand",
    "do not understand",
    "not confident",
  ];
  if (negativeMarkers.some((marker) => normalized.includes(marker))) {
    return false;
  }

  const positiveMarkers = [
    "掌握",
    "会了",
    "懂了",
    "理解了",
    "很熟",
    "没问题",
    "有把握",
    "confident",
    "i understand",
    "got it",
  ];
  return positiveMarkers.some((marker) => normalized.includes(marker));
}

function hasConfidentTextClaimSignal(evidence: Evidence[]): boolean {
  return evidence.some((item) => {
    if (item.type === "self_report") {
      const statement = textPayloadValue(item, ["statement", "content"]);
      return statement !== null && hasConfidentClaimText(statement);
    }

    if (item.type === "chat") {
      const role = textPayloadValue(item, ["role"]);
      if (role !== "user") {
        return false;
      }
      const content = textPayloadValue(item, ["content"]);
      return content !== null && hasConfidentClaimText(content);
    }

    return false;
  });
}

function hasContradictionSignal(
  evidence: Evidence[],
  policy: HarnessTriggerPolicy,
): boolean {
  const contradictionScoreGap =
    policy.contradictionScoreGap ??
    DEFAULT_HARNESS_TRIGGER_POLICY.contradictionScoreGap ??
    0.3;
  const highSelfReportScore =
    policy.highSelfReportScore ??
    DEFAULT_HARNESS_TRIGGER_POLICY.highSelfReportScore ??
    0.8;
  const lowQuizScores = evidence
    .filter((item) => item.type === "quiz")
    .flatMap((item) => {
      const score = numericPayloadValue(item, ["score", "correctRate", "correct_rate"]);
      return score !== null && score <= policy.lowQuizScore ? [score] : [];
    });

  if (lowQuizScores.length === 0) {
    return false;
  }

  const selfReportedScores = evidence
    .filter((item) => item.type === "self_report")
    .flatMap((item) => {
      const score = numericPayloadValue(item, [
        "confidenceScore",
        "selfRatedScore",
        "self_report_score",
        "masteryScore",
      ]);
      return score !== null && score >= highSelfReportScore ? [score] : [];
    });

  if (
    selfReportedScores.some((selfScore) =>
      lowQuizScores.some((quizScore) => selfScore - quizScore >= contradictionScoreGap),
    )
  ) {
    return true;
  }

  return hasConfidentTextClaimSignal(evidence);
}

function triggered(
  reason: Exclude<HarnessTriggerReason, "no_evidence">,
  evidence: Evidence[],
): HarnessTriggerDecision {
  return {
    shouldRun: true,
    reason,
    evidenceCount: evidence.length,
    evidenceIds: evidenceIds(evidence),
  };
}

export function shouldTriggerHarnessUpdate(
  input: ShouldTriggerHarnessUpdateInput,
): HarnessTriggerDecision {
  const policy = input.policy ?? DEFAULT_HARNESS_TRIGGER_POLICY;
  const evidence = input.unconsumedEvidence;

  if (evidence.length === 0) {
    return { shouldRun: false, reason: "no_evidence", evidenceCount: 0 };
  }

  if (!input.latestPortrait) {
    return triggered("first_portrait", evidence);
  }

  if (hasContradictionSignal(evidence, policy)) {
    return triggered("contradiction_signal", evidence);
  }

  if (evidence.length >= policy.minEvidenceCount) {
    return triggered("evidence_count", evidence);
  }

  if (hasStrongRecommendationFeedback(evidence, policy)) {
    return triggered("strong_recommendation_feedback", evidence);
  }

  if (hasLowQuizScore(evidence, policy)) {
    return triggered("low_quiz_score", evidence);
  }

  return {
    shouldRun: false,
    reason: "evidence_count",
    evidenceCount: evidence.length,
  };
}

function truncate(value: string, maxLength = 80): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function createEvidence(
  event: BaseEvidenceEvent,
  type: NewEvidence["type"],
  summary: string,
  payload: Record<string, unknown>,
  now: () => string,
): NewEvidence {
  return {
    domain: event.domain,
    type,
    summary: event.summary ?? summary,
    payload,
    createdAt: now(),
  };
}

export function createEvidenceCollector(
  options: EvidenceCollectorOptions,
): EvidenceCollector {
  const now = options.now ?? (() => new Date().toISOString());
  const insert = (input: NewEvidence) => options.repository.insert(input);

  return {
    recordChat(event) {
      return insert(
        createEvidence(
          event,
          "chat",
          `${event.role} 对话：${truncate(event.content)}`,
          {
            content: event.content,
            role: event.role,
            sessionId: event.sessionId,
          },
          now,
        ),
      );
    },

    recordSelfReport(event) {
      return insert(
        createEvidence(
          event,
          "self_report",
          `用户自评：${truncate(event.statement)}`,
          {
            statement: event.statement,
            dimensionHints: event.dimensionHints ?? [],
            confidenceScore: event.confidenceScore,
          },
          now,
        ),
      );
    },

    recordQuiz(event) {
      return insert(
        createEvidence(
          event,
          "quiz",
          `${event.topic} 测验得分 ${event.score}`,
          {
            topic: event.topic,
            score: event.score,
            total: event.total,
            correct: event.correct,
          },
          now,
        ),
      );
    },

    recordReading(event) {
      return insert(
        createEvidence(
          event,
          "reading",
          `阅读 ${event.title}：${event.status}`,
          {
            title: event.title,
            url: event.url,
            status: event.status,
            dwellSeconds: event.dwellSeconds ?? 0,
          },
          now,
        ),
      );
    },

    recordRecommendationClick(event) {
      return insert(
        createEvidence(
          event,
          "reco_click",
          `点击推荐：${event.topic}`,
          {
            recommendationId: event.recommendationId,
            topic: event.topic,
            dwellSeconds: event.dwellSeconds ?? 0,
          },
          now,
        ),
      );
    },

    recordRecommendationSkip(event) {
      return insert(
        createEvidence(
          event,
          "reco_skip",
          `跳过推荐：${event.topic}`,
          {
            recommendationId: event.recommendationId,
            topic: event.topic,
          },
          now,
        ),
      );
    },
  };
}
