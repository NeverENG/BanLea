import {
  createEvidenceCollector,
  shouldTriggerHarnessUpdate,
  type ChatEvidenceEvent,
  type HarnessTriggerDecision,
  type QuizEvidenceEvent,
  type ReadingEvidenceEvent,
  type RecommendationClickEvidenceEvent,
  type RecommendationSkipEvidenceEvent,
  type SelfReportEvidenceEvent,
} from "@/core/evidence";
import type {
  HarnessRunRepositories,
  TriggeredHarnessUpdateResult,
} from "@/core/harness";
import type { PortraitVersionRecord } from "@/db/portraitRepo";
import type { HarnessTriggerPolicy } from "@/config";
import type { Evidence } from "@/types/evidence";

export interface LearningEventServiceOptions {
  repositories: HarnessRunRepositories;
  evidenceLimit?: number;
  now?: () => string;
  policy?: HarnessTriggerPolicy;
  updateAfterEvidence?: (evidence: Evidence) => Promise<TriggeredHarnessUpdateResult>;
}

export interface LearningEventResult {
  evidence: Evidence;
  update: TriggeredHarnessUpdateResult;
}

export interface LearningEventService {
  recordChat(event: ChatEvidenceEvent): Promise<LearningEventResult>;
  recordSelfReport(event: SelfReportEvidenceEvent): Promise<LearningEventResult>;
  recordQuiz(event: QuizEvidenceEvent): Promise<LearningEventResult>;
  recordReading(event: ReadingEvidenceEvent): Promise<LearningEventResult>;
  recordRecommendationClick(
    event: RecommendationClickEvidenceEvent,
  ): Promise<LearningEventResult>;
  recordRecommendationSkip(
    event: RecommendationSkipEvidenceEvent,
  ): Promise<LearningEventResult>;
}

export interface LearningLoopStatusOptions {
  domain: string;
  repositories: HarnessRunRepositories;
  evidenceLimit?: number;
  policy?: HarnessTriggerPolicy;
}

export interface LearningLoopStatus {
  domain: string;
  latest: PortraitVersionRecord | null;
  portraitVersion: number | null;
  portraitConfidence: number | null;
  portraitUpdatedAt: string | null;
  changeSummary: string | null;
  unconsumedEvidenceCount: number;
  trigger: HarnessTriggerDecision;
}

export async function loadLearningLoopStatus(
  options: LearningLoopStatusOptions,
): Promise<LearningLoopStatus> {
  const [latest, unconsumedEvidence] = await Promise.all([
    options.repositories.portraits.getLatest(options.domain),
    options.repositories.evidence.listUnconsumed(
      options.domain,
      options.evidenceLimit,
    ),
  ]);
  const trigger = shouldTriggerHarnessUpdate({
    latestPortrait: latest?.portrait ?? null,
    unconsumedEvidence,
    policy: options.policy,
  });

  return {
    domain: options.domain,
    latest,
    portraitVersion: latest?.version ?? null,
    portraitConfidence: latest?.confidence ?? null,
    portraitUpdatedAt: latest?.createdAt ?? null,
    changeSummary: latest?.changeSummary ?? null,
    unconsumedEvidenceCount: unconsumedEvidence.length,
    trigger,
  };
}

export function createLearningEventService(
  options: LearningEventServiceOptions,
): LearningEventService {
  const collector = createEvidenceCollector({
    repository: options.repositories.evidence,
    now: options.now,
  });

  async function updateAfterEvidence(
    evidence: Evidence,
  ): Promise<TriggeredHarnessUpdateResult> {
    if (options.updateAfterEvidence) {
      return options.updateAfterEvidence(evidence);
    }

    const [latest, unconsumedEvidence] = await Promise.all([
      options.repositories.portraits.getLatest(evidence.domain),
      options.repositories.evidence.listUnconsumed(evidence.domain, options.evidenceLimit),
    ]);
    const trigger = shouldTriggerHarnessUpdate({
      latestPortrait: latest?.portrait ?? null,
      unconsumedEvidence,
      policy: options.policy,
    });

    if (!trigger.shouldRun) {
      return {
        status: "skipped",
        reason: "trigger_not_met",
        trigger,
        latest,
        consumedEvidenceIds: [],
      };
    }

    return {
      status: "deferred",
      reason: "model_not_initialized",
      trigger,
      latest,
      consumedEvidenceIds: [],
    };
  }

  async function record<TEvent>(
    event: TEvent,
    write: (event: TEvent) => Promise<Evidence>,
  ): Promise<LearningEventResult> {
    const evidence = await write(event);
    const update = await updateAfterEvidence(evidence);
    return { evidence, update };
  }

  return {
    recordChat(event) {
      return record(event, collector.recordChat);
    },

    recordSelfReport(event) {
      return record(event, collector.recordSelfReport);
    },

    recordQuiz(event) {
      return record(event, collector.recordQuiz);
    },

    recordReading(event) {
      return record(event, collector.recordReading);
    },

    recordRecommendationClick(event) {
      return record(event, collector.recordRecommendationClick);
    },

    recordRecommendationSkip(event) {
      return record(event, collector.recordRecommendationSkip);
    },
  };
}
