import type {
  PortraitRepository,
  PortraitVersionRecord,
} from "@/db/portraitRepo";

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
