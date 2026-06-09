import {
  createEvidenceCollector,
  type ChatEvidenceEvent,
  type QuizEvidenceEvent,
  type ReadingEvidenceEvent,
  type RecommendationClickEvidenceEvent,
  type RecommendationSkipEvidenceEvent,
  type SelfReportEvidenceEvent,
} from "@/core/evidence";
import {
  runHarnessUpdateIfTriggered,
  type HarnessModel,
  type HarnessRunRepositories,
  type TriggeredHarnessUpdateResult,
} from "@/core/harness";
import type { HarnessTriggerPolicy } from "@/config";
import type { Evidence } from "@/types/evidence";
import type { PortraitScope } from "@/types/portrait";

export interface LearningEventServiceOptions {
  repositories: HarnessRunRepositories;
  evidenceLimit?: number;
  now?: () => string;
  model?: HarnessModel;
  policy?: HarnessTriggerPolicy;
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

function scopeForDomain(domain: string): PortraitScope {
  return domain === "global" ? "global" : "domain";
}

export function createLearningEventService(
  options: LearningEventServiceOptions,
): LearningEventService {
  const collector = createEvidenceCollector({
    repository: options.repositories.evidence,
    now: options.now,
  });

  async function updateAfterEvidence(evidence: Evidence) {
    return runHarnessUpdateIfTriggered({
      scope: scopeForDomain(evidence.domain),
      domain: evidence.domain,
      repositories: options.repositories,
      evidenceLimit: options.evidenceLimit,
      now: options.now,
      model: options.model,
      policy: options.policy,
    });
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
