import {
  DEFAULT_HARNESS_TRIGGER_POLICY,
  type HarnessTriggerPolicy,
} from "@/config";
import type { Evidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";

// 证据采集与触发器（§5①②）

export type HarnessTriggerReason =
  | "no_evidence"
  | "first_portrait"
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
