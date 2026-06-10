import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
import type { LearningEventResult, LearningEventService } from "@/features/events";
import {
  DIMENSION_META,
  type DimensionGroup,
  type HarnessLayer,
  type VolatilityTier,
} from "@/types/dimensions";
import type { DimensionKey, Portrait } from "@/types/portrait";

export interface PortraitTimelineOptions {
  domain: string;
  repository: PortraitRepository;
  limit?: number;
}

export interface PortraitTimelineItem {
  id: number;
  version: number;
  createdAt: string;
  confidence: number;
  changeSummary: string | null;
  dimensionCount: number;
  dimensions: Portrait["dimensions"];
  nextFocus: string | null;
}

export interface PortraitDimensionVisualItem {
  key: DimensionKey;
  label: string;
  harness: HarnessLayer;
  tier: VolatilityTier;
  groups: DimensionGroup[];
  score: number | null;
  confidence: number;
  value: number;
  summary: string;
  evidenceCount: number;
  isLowConfidence: boolean;
}

export interface BuildPortraitDimensionVisualItemsOptions {
  limit?: number;
  lowConfidenceThreshold?: number;
}

export interface PortraitDimensionTrendPoint {
  version: number;
  createdAt: string;
  score: number | null;
  confidence: number;
  value: number;
}

export interface PortraitDimensionTrendItem {
  key: DimensionKey;
  label: string;
  points: PortraitDimensionTrendPoint[];
  latestValue: number;
  delta: number | null;
}

export interface BuildPortraitDimensionTrendItemsOptions {
  keys?: DimensionKey[];
  limit?: number;
}

export interface PortraitRevisionRequestInput {
  domain: string;
  dimension: DimensionKey;
  request: string;
  currentSummary?: string | null;
  confidenceScore?: number;
}

export interface PortraitRevisionEvidenceDraft {
  domain: string;
  statement: string;
  dimensionHints: string[];
  confidenceScore: number;
  summary: string;
}

export interface RecordPortraitRevisionRequestOptions {
  input: PortraitRevisionRequestInput;
  learningEvents: Pick<LearningEventService, "recordSelfReport">;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isDimensionKey(value: string): value is DimensionKey {
  return value in DIMENSION_META;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function buildPortraitDimensionVisualItems(
  portrait: Portrait | null,
  options: BuildPortraitDimensionVisualItemsOptions = {},
): PortraitDimensionVisualItem[] {
  if (!portrait) {
    return [];
  }

  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 0.45;
  const limit = options.limit ?? 8;
  return Object.entries(portrait.dimensions)
    .flatMap(([key, value]): PortraitDimensionVisualItem[] => {
      if (!isDimensionKey(key)) {
        return [];
      }
      const meta = DIMENSION_META[key];
      const score = typeof value.score === "number" ? clamp01(value.score) : null;
      const confidence = clamp01(value.confidence);
      return [
        {
          key,
          label: meta.label,
          harness: meta.harness,
          tier: meta.tier,
          groups: meta.groups,
          score,
          confidence,
          value: score ?? confidence,
          summary: value.summary,
          evidenceCount: value.evidenceIds.length,
          isLowConfidence: confidence < lowConfidenceThreshold,
        },
      ];
    })
    .sort((left, right) => {
      const confidenceOrder = right.confidence - left.confidence;
      if (confidenceOrder !== 0) {
        return confidenceOrder;
      }
      return right.value - left.value;
    })
    .slice(0, limit);
}

const DEFAULT_TREND_KEYS: DimensionKey[] = [
  "mastery",
  "progress",
  "interest",
  "velocity",
];

export function buildPortraitDimensionTrendItems(
  timeline: PortraitTimelineItem[],
  options: BuildPortraitDimensionTrendItemsOptions = {},
): PortraitDimensionTrendItem[] {
  const keys = options.keys ?? DEFAULT_TREND_KEYS;
  const limit = options.limit ?? 4;
  return keys
    .flatMap((key): PortraitDimensionTrendItem[] => {
      const points = timeline
        .slice()
        .sort((left, right) => left.version - right.version)
        .flatMap((item): PortraitDimensionTrendPoint[] => {
          const dimension = item.dimensions[key];
          if (!dimension) {
            return [];
          }
          const score =
            typeof dimension.score === "number" ? clamp01(dimension.score) : null;
          const confidence = clamp01(dimension.confidence);
          return [
            {
              version: item.version,
              createdAt: item.createdAt,
              score,
              confidence,
              value: score ?? confidence,
            },
          ];
        });

      if (points.length === 0) {
        return [];
      }

      const first = points[0];
      const latest = points[points.length - 1];
      return [
        {
          key,
          label: DIMENSION_META[key].label,
          points,
          latestValue: latest.value,
          delta: points.length > 1 ? latest.value - first.value : null,
        },
      ];
    })
    .slice(0, limit);
}

export function buildPortraitRevisionEvidenceDraft(
  input: PortraitRevisionRequestInput,
): PortraitRevisionEvidenceDraft {
  const request = normalizeText(input.request);
  if (!request) {
    throw new Error("portrait revision request cannot be empty");
  }

  const meta = DIMENSION_META[input.dimension];
  const currentSummary = input.currentSummary
    ? normalizeText(input.currentSummary)
    : "";
  const statement = currentSummary
    ? `希望调整画像维度「${meta.label}」：${request}\n当前摘要：${currentSummary}`
    : `希望调整画像维度「${meta.label}」：${request}`;

  return {
    domain: input.domain,
    statement,
    dimensionHints: [input.dimension],
    confidenceScore: clamp01(input.confidenceScore ?? 0.8),
    summary: `画像协商：${meta.label}`,
  };
}

export async function recordPortraitRevisionRequest({
  input,
  learningEvents,
}: RecordPortraitRevisionRequestOptions): Promise<LearningEventResult> {
  const draft = buildPortraitRevisionEvidenceDraft(input);
  return learningEvents.recordSelfReport(draft);
}

function toTimelineItem(record: PortraitVersionRecord): PortraitTimelineItem {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    confidence: record.confidence,
    changeSummary: record.changeSummary,
    dimensionCount: Object.keys(record.portrait.dimensions).length,
    dimensions: record.portrait.dimensions,
    nextFocus: record.portrait.nextFocus ?? null,
  };
}

export async function loadPortraitTimeline(
  options: PortraitTimelineOptions,
): Promise<PortraitTimelineItem[]> {
  const limit = options.limit ?? 5;
  const records = await options.repository.listByDomain(options.domain);
  return records
    .slice()
    .sort((left, right) => right.version - left.version)
    .slice(0, limit)
    .map(toTimelineItem);
}
