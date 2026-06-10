export type ResourceSourceId =
  | "web"
  | "github"
  | "arxiv"
  | "docs"
  | "video"
  | "zhihu";

export type ResourceItemKind =
  | "article"
  | "video"
  | "repo"
  | "doc"
  | "paper";

export interface ResourceSearchContext {
  domain: string;
  portraitSummary?: string | null;
  preferredKinds?: ResourceItemKind[];
  language?: string;
}

export interface ResourceSearchQuery {
  topic: string;
  intent?: "learn" | "read" | "practice";
  limit?: number;
}

export interface ResourceItem {
  id: string;
  sourceId: ResourceSourceId | string;
  title: string;
  url: string;
  kind: ResourceItemKind;
  summary?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceSource {
  id: ResourceSourceId | string;
  label: string;
  enabled: boolean;
  search(
    query: ResourceSearchQuery,
    context: ResourceSearchContext,
  ): Promise<ResourceItem[]> | ResourceItem[];
}

export interface ResourceSourceResult {
  sourceId: string;
  label: string;
  items: ResourceItem[];
}

export interface SearchResourceSourcesOptions {
  sources: ResourceSource[];
  query: ResourceSearchQuery;
  context: ResourceSearchContext;
  perSourceLimit?: number;
}

export interface StaticResourceSourceOptions {
  id: ResourceSourceId | string;
  label: string;
  items: ResourceItem[];
  enabled?: boolean;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesQuery(item: ResourceItem, topic: string): boolean {
  const normalizedTopic = normalizeText(topic);
  if (!normalizedTopic) {
    return true;
  }
  return [item.title, item.summary ?? "", item.url]
    .map(normalizeText)
    .some((value) => value.includes(normalizedTopic));
}

function limitItems(items: ResourceItem[], limit?: number): ResourceItem[] {
  return typeof limit === "number" ? items.slice(0, Math.max(0, limit)) : items;
}

export async function searchResourceSources({
  sources,
  query,
  context,
  perSourceLimit,
}: SearchResourceSourcesOptions): Promise<ResourceSourceResult[]> {
  const limit = perSourceLimit ?? query.limit;
  const enabledSources = sources.filter((source) => source.enabled);
  return Promise.all(
    enabledSources.map(async (source) => ({
      sourceId: source.id,
      label: source.label,
      items: limitItems(await source.search(query, context), limit),
    })),
  );
}

export function flattenResourceSourceResults(
  results: ResourceSourceResult[],
  limit?: number,
): ResourceItem[] {
  const items = results.flatMap((result) => result.items);
  return limitItems(items, limit);
}

export function createStaticResourceSource({
  id,
  label,
  items,
  enabled = true,
}: StaticResourceSourceOptions): ResourceSource {
  return {
    id,
    label,
    enabled,
    search(query) {
      return items.filter((item) => matchesQuery(item, query.topic));
    },
  };
}
