import type { ReadingListRepository } from "@/db/readingListRepo";
import type { LearningEventResult, LearningEventService } from "@/features/events";
import type { TutorResourceSuggestion } from "@/features/tutor";
import type { ReadingListItem, ReadingListKind } from "@/types/readingList";
import type { ReadingEvidenceEvent } from "@/core/evidence";
import type { ReadingListStatus } from "@/types/readingList";

export interface LoadReadingListOptions {
  domain: string;
  repository: ReadingListRepository;
}

export interface AddTutorResourceSuggestionsOptions {
  domain: string;
  suggestions: TutorResourceSuggestion[];
  repository: ReadingListRepository;
  evidenceId?: number | null;
  now?: () => string;
}

export interface ChangeReadingListItemStatusOptions {
  id: number;
  status: ReadingListStatus;
  repository: ReadingListRepository;
  learningEvents?: Pick<LearningEventService, "recordReading">;
  dwellSeconds?: number;
  now?: () => string;
}

export interface ChangeReadingListItemStatusResult {
  item: ReadingListViewItem;
  learning: LearningEventResult | null;
}

export interface ReadingListViewItem {
  id: number | null;
  title: string;
  kind: ReadingListKind;
  status: ReadingListItem["status"];
  url: string | null;
  addedAt: string;
}

export type ReadingListStatusCounts = Record<ReadingListStatus, number>;

export interface ReadingListSummary {
  total: number;
  byStatus: ReadingListStatusCounts;
  doneDwellSeconds: number;
}

export interface ReadingListOverview {
  items: ReadingListViewItem[];
  summary: ReadingListSummary;
}

const defaultNow = () => new Date().toISOString();

function toViewItem(item: ReadingListItem): ReadingListViewItem {
  return {
    id: item.id ?? null,
    title: item.title,
    kind: item.kind,
    status: item.status,
    url: item.url,
    addedAt: item.addedAt,
  };
}

function emptyStatusCounts(): ReadingListStatusCounts {
  return {
    todo: 0,
    reading: 0,
    done: 0,
    later: 0,
  };
}

export function summarizeReadingList(items: ReadingListItem[]): ReadingListSummary {
  const byStatus = emptyStatusCounts();
  let doneDwellSeconds = 0;

  for (const item of items) {
    byStatus[item.status] += 1;
    if (item.status === "done") {
      doneDwellSeconds += item.dwellSeconds;
    }
  }

  return {
    total: items.length,
    byStatus,
    doneDwellSeconds,
  };
}

function sourceIdForSuggestion(
  suggestion: TutorResourceSuggestion,
  index: number,
  evidenceId: number | null | undefined,
  addedAt: string,
): string {
  const base = typeof evidenceId === "number" ? `evidence-${evidenceId}` : addedAt;
  return `tutor:${base}:${index}:${suggestion.kind}`;
}

export async function loadReadingList(
  options: LoadReadingListOptions,
): Promise<ReadingListViewItem[]> {
  const rows = await options.repository.listByDomain(options.domain);
  return rows.map(toViewItem);
}

export async function loadReadingListOverview(
  options: LoadReadingListOptions,
): Promise<ReadingListOverview> {
  const rows = await options.repository.listByDomain(options.domain);
  return {
    items: rows.map(toViewItem),
    summary: summarizeReadingList(rows),
  };
}

export async function addTutorResourceSuggestions(
  options: AddTutorResourceSuggestionsOptions,
): Promise<ReadingListViewItem[]> {
  if (options.suggestions.length === 0) {
    return [];
  }

  const addedAt = (options.now ?? defaultNow)();
  const inserted = await Promise.all(
    options.suggestions.map((suggestion, index) =>
      options.repository.insert({
        domain: options.domain,
        sourceId: sourceIdForSuggestion(
          suggestion,
          index,
          options.evidenceId,
          addedAt,
        ),
        title: suggestion.title,
        url: suggestion.url ?? null,
        kind: suggestion.kind,
        status: "todo",
        addedAt,
      }),
    ),
  );

  return inserted.map(toViewItem);
}

function readAtForStatus(status: ReadingListStatus, now: () => string): string | null {
  return status === "done" ? now() : null;
}

function toReadingEvidenceEvent(
  item: ReadingListItem,
): ReadingEvidenceEvent {
  return {
    domain: item.domain,
    title: item.title,
    url: item.url ?? undefined,
    status: item.status,
    dwellSeconds: item.dwellSeconds,
  };
}

export async function changeReadingListItemStatus(
  options: ChangeReadingListItemStatusOptions,
): Promise<ChangeReadingListItemStatusResult> {
  const now = options.now ?? defaultNow;
  const updated = await options.repository.updateStatus(options.id, {
    status: options.status,
    readAt: readAtForStatus(options.status, now),
    dwellSeconds: options.dwellSeconds ?? 0,
  });

  if (!updated) {
    throw new Error(`reading_list item ${options.id} not found`);
  }

  const learning = options.learningEvents
    ? await options.learningEvents.recordReading(toReadingEvidenceEvent(updated))
    : null;

  return {
    item: toViewItem(updated),
    learning,
  };
}
