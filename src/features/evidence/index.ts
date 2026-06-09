import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { Evidence, EvidenceType } from "@/types/evidence";

export interface EvidenceTimelineOptions {
  domain: string;
  repository: EvidenceRepository;
  limit?: number;
}

export interface EvidenceTimelineItem {
  id: number | null;
  type: EvidenceType;
  summary: string;
  createdAt: string;
  consumedInVersion: number | null;
  status: "pending" | "consumed";
}

function toTimelineItem(evidence: Evidence): EvidenceTimelineItem {
  return {
    id: evidence.id ?? null,
    type: evidence.type,
    summary: evidence.summary,
    createdAt: evidence.createdAt,
    consumedInVersion: evidence.consumedInVersion,
    status: evidence.consumedInVersion === null ? "pending" : "consumed",
  };
}

export async function loadEvidenceTimeline(
  options: EvidenceTimelineOptions,
): Promise<EvidenceTimelineItem[]> {
  const limit = options.limit ?? 8;
  const evidence = await options.repository.listByDomain(options.domain);
  return evidence
    .slice()
    .sort((left, right) => {
      const timeOrder = right.createdAt.localeCompare(left.createdAt);
      if (timeOrder !== 0) {
        return timeOrder;
      }
      return (right.id ?? 0) - (left.id ?? 0);
    })
    .slice(0, limit)
    .map(toTimelineItem);
}
