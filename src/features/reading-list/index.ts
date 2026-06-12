import type { ReadingListRepository } from "@/db/readingListRepo";
import type { ResourceItem, ResourceItemKind } from "@/core/sources";
import type { LearningEventResult, LearningEventService } from "@/features/events";
import type { TutorResourceSuggestion } from "@/features/tutor";
import type {
  NewReadingListItem,
  ReadingListItem,
  ReadingListKind,
  ReadingListStatus,
} from "@/types/readingList";
import type { ReadingEvidenceEvent } from "@/core/evidence";

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

export interface ResourceItemsToReadingListOptions {
  domain: string;
  items: ResourceItem[];
  addedAt: string;
  limit?: number;
  status?: ReadingListStatus;
}

export interface AddResourceItemsToReadingListOptions {
  domain: string;
  items: ResourceItem[];
  repository: ReadingListRepository;
  limit?: number;
  status?: ReadingListStatus;
  now?: () => string;
}

export interface ManualReadingListDraft {
  title?: string;
  url: string;
  kind?: ReadingListKind;
  status?: ReadingListStatus;
}

export interface BuildManualReadingListItemInputOptions
  extends ManualReadingListDraft {
  domain: string;
  addedAt: string;
}

export interface AddManualReadingListItemOptions
  extends ManualReadingListDraft {
  domain: string;
  repository: ReadingListRepository;
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
  groups: ReadingListGroup[];
  summary: ReadingListSummary;
}

export interface ReadingListGroup {
  status: ReadingListStatus;
  label: string;
  items: ReadingListViewItem[];
}

const READING_LIST_STATUS_ORDER: ReadingListStatus[] = [
  "todo",
  "reading",
  "later",
  "done",
];

const READING_LIST_STATUS_LABELS: Record<ReadingListStatus, string> = {
  todo: "待读",
  reading: "阅读中",
  later: "稍后",
  done: "已读",
};

const defaultNow = () => new Date().toISOString();

const RESOURCE_KIND_TO_READING_KIND: Record<ResourceItemKind, ReadingListKind> = {
  article: "article",
  video: "video",
  repo: "repo",
  doc: "doc",
  paper: "article",
};

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

function normalizeManualUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("请输入资料链接");
  }
  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("资料链接格式不正确");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("资料链接只支持 http 或 https");
  }
  return parsed.toString();
}

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.hostname}${path}`;
}

function inferReadingListKindFromUrl(url: string): ReadingListKind {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (hostname === "github.com" || hostname.endsWith(".github.com")) {
    return "repo";
  }

  if (
    hostname === "youtu.be" ||
    hostname.endsWith("youtube.com") ||
    hostname.endsWith("bilibili.com")
  ) {
    return "video";
  }

  if (/\/(article|blog|post|posts)\//.test(pathname)) {
    return "article";
  }

  return "doc";
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

export function groupReadingListItems(
  items: ReadingListViewItem[],
): ReadingListGroup[] {
  return READING_LIST_STATUS_ORDER.map((status) => ({
    status,
    label: READING_LIST_STATUS_LABELS[status],
    items: items.filter((item) => item.status === status),
  }));
}

function sourceIdForSuggestion(
  suggestion: TutorResourceSuggestion,
  index: number,
  evidenceId: number | null | undefined,
  addedAt: string,
): string | null {
  if (suggestion.sourceId !== undefined) {
    return suggestion.sourceId;
  }
  const base = typeof evidenceId === "number" ? `evidence-${evidenceId}` : addedAt;
  return `tutor:${base}:${index}:${suggestion.kind}`;
}

function limitItems<T>(items: T[], limit?: number): T[] {
  return typeof limit === "number" ? items.slice(0, Math.max(0, limit)) : items;
}

function sameReadingListIdentity(
  existing: Pick<ReadingListItem, "sourceId" | "url">,
  item: Pick<NewReadingListItem, "sourceId" | "url">,
): boolean {
  const sourceId = item.sourceId ?? null;
  const url = item.url ?? null;
  return Boolean(
    (url && existing.url === url) ||
      (sourceId && existing.sourceId === sourceId),
  );
}

function findExistingReadingListItem(
  existingItems: ReadingListItem[],
  item: Pick<NewReadingListItem, "sourceId" | "url">,
): ReadingListItem | null {
  return (
    existingItems.find((existing) => sameReadingListIdentity(existing, item)) ??
    null
  );
}

function appendReadingListIdentity(
  existingItems: Pick<ReadingListItem, "sourceId" | "url">[],
  item: Pick<NewReadingListItem, "sourceId" | "url">,
) {
  existingItems.push({
    sourceId: item.sourceId ?? null,
    url: item.url ?? null,
  });
}

function resourceItemReason(item: ResourceItem): string {
  const parts = [item.summary, `source: ${item.sourceId}`].filter(
    (part): part is string => Boolean(part),
  );
  const stars = item.metadata?.stars;
  const language = item.metadata?.language;

  if (typeof stars === "number") {
    parts.push(`${stars} stars`);
  }
  if (typeof language === "string" && language) {
    parts.push(language);
  }

  return parts.join(" · ");
}

export function resourceKindToReadingListKind(
  kind: ResourceItemKind,
): ReadingListKind {
  return RESOURCE_KIND_TO_READING_KIND[kind];
}

export function resourceItemToTutorResourceSuggestion(
  item: ResourceItem,
): TutorResourceSuggestion {
  return {
    sourceId: item.id,
    title: item.title,
    kind: resourceKindToReadingListKind(item.kind),
    url: item.url,
    reason: resourceItemReason(item),
  };
}

export function resourceItemsToTutorResourceSuggestions(
  items: ResourceItem[],
  limit?: number,
): TutorResourceSuggestion[] {
  return limitItems(items, limit).map(resourceItemToTutorResourceSuggestion);
}

export function buildManualReadingListItemInput({
  domain,
  title,
  url,
  kind,
  status,
  addedAt,
}: BuildManualReadingListItemInputOptions): NewReadingListItem {
  const normalizedUrl = normalizeManualUrl(url);
  const normalizedTitle = title?.trim() || titleFromUrl(normalizedUrl);

  return {
    domain,
    sourceId: `manual:${addedAt}`,
    title: normalizedTitle,
    url: normalizedUrl,
    kind: kind ?? inferReadingListKindFromUrl(normalizedUrl),
    status: status ?? "todo",
    addedAt,
  };
}

export async function addManualReadingListItem({
  domain,
  title,
  url,
  kind,
  status,
  repository,
  now = defaultNow,
}: AddManualReadingListItemOptions): Promise<ReadingListViewItem> {
  const item = buildManualReadingListItemInput({
    domain,
    title,
    url,
    kind,
    status,
    addedAt: now(),
  });
  const existingItems = await repository.listByDomain(domain);
  const duplicate = findExistingReadingListItem(existingItems, item);
  if (duplicate) {
    return toViewItem(duplicate);
  }
  const inserted = await repository.insert(item);
  return toViewItem(inserted);
}

export function resourceItemToReadingListItem(
  item: ResourceItem,
  options: {
    domain: string;
    addedAt: string;
    status?: ReadingListStatus;
  },
): NewReadingListItem {
  return {
    domain: options.domain,
    sourceId: item.id,
    title: item.title,
    url: item.url,
    kind: resourceKindToReadingListKind(item.kind),
    status: options.status ?? "todo",
    addedAt: options.addedAt,
  };
}

export function resourceItemsToReadingListItems({
  domain,
  items,
  addedAt,
  limit,
  status,
}: ResourceItemsToReadingListOptions): NewReadingListItem[] {
  return limitItems(items, limit).map((item) =>
    resourceItemToReadingListItem(item, {
      domain,
      addedAt,
      status,
    }),
  );
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
  const items = rows.map(toViewItem);
  return {
    items,
    groups: groupReadingListItems(items),
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
  const existingItems = await options.repository.listByDomain(options.domain);
  const insertItems = options.suggestions.reduce<NewReadingListItem[]>(
    (items, suggestion, index) => {
      const item: NewReadingListItem = {
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
      };

      if (findExistingReadingListItem(existingItems, item)) {
        return items;
      }

      appendReadingListIdentity(existingItems, item);
      items.push(item);
      return items;
    },
    [],
  );
  const inserted = await Promise.all(
    insertItems.map((item) => options.repository.insert(item)),
  );

  return inserted.map(toViewItem);
}

export async function addResourceItemsToReadingList(
  options: AddResourceItemsToReadingListOptions,
): Promise<ReadingListViewItem[]> {
  if (options.items.length === 0) {
    return [];
  }

  const addedAt = (options.now ?? defaultNow)();
  const items = resourceItemsToReadingListItems({
    domain: options.domain,
    items: options.items,
    addedAt,
    limit: options.limit,
    status: options.status,
  });
  const existingItems = await options.repository.listByDomain(options.domain);
  const insertItems = items.filter((item) => {
    if (findExistingReadingListItem(existingItems, item)) {
      return false;
    }
    appendReadingListIdentity(existingItems, item);
    return true;
  });
  const inserted = await Promise.all(
    insertItems.map((item) => options.repository.insert(item)),
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
