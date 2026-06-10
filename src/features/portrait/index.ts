import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isDimensionKey(value: string): value is DimensionKey {
  return value in DIMENSION_META;
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

function toTimelineItem(record: PortraitVersionRecord): PortraitTimelineItem {
  return {
    id: record.id,
    version: record.version,
    createdAt: record.createdAt,
    confidence: record.confidence,
    changeSummary: record.changeSummary,
    dimensionCount: Object.keys(record.portrait.dimensions).length,
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
