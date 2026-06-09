import type { ReadingListRepository } from "@/db/readingListRepo";
import type { TutorResourceSuggestion } from "@/features/tutor";
import type { ReadingListItem, ReadingListKind } from "@/types/readingList";

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

export interface ReadingListViewItem {
  id: number | null;
  title: string;
  kind: ReadingListKind;
  status: ReadingListItem["status"];
  url: string | null;
  addedAt: string;
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
