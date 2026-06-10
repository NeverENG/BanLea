import type {
  ResourceItem,
  ResourceSearchContext,
  ResourceSearchQuery,
  ResourceSource,
} from "./index";

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

export interface GitHubRepositoryApiItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics?: string[];
  updated_at?: string;
  archived?: boolean;
  fork?: boolean;
}

export interface GitHubRepositorySearchResponse {
  items?: GitHubRepositoryApiItem[];
}

export type GitHubFetchJson = (
  url: string,
  init: RequestInit,
) => Promise<unknown>;

export interface GitHubResourceSourceOptions {
  enabled?: boolean;
  token?: string | null;
  perPage?: number;
  apiBaseUrl?: string;
  fetchJson?: GitHubFetchJson;
}

export interface GitHubRepositorySearchUrlOptions {
  query: ResourceSearchQuery;
  context: ResourceSearchContext;
  perPage?: number;
  apiBaseUrl?: string;
}

function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeQualifierValue(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

function clampPerPage(value: number): number {
  return Math.min(MAX_PER_PAGE, Math.max(1, Math.floor(value)));
}

function requestedPerPage(query: ResourceSearchQuery, perPage?: number): number {
  return clampPerPage(query.limit ?? perPage ?? DEFAULT_PER_PAGE);
}

export function buildGitHubRepositoryQuery(
  query: ResourceSearchQuery,
  context: ResourceSearchContext,
): string {
  const terms = [normalizeSearchTerm(query.topic)].filter(Boolean);
  const qualifiers = ["in:name,description,readme", "archived:false"];

  if (context.language) {
    qualifiers.push(`language:${normalizeQualifierValue(context.language)}`);
  }

  if (query.intent === "practice") {
    terms.push("example");
  }

  return [...terms, ...qualifiers].join(" ");
}

export function buildGitHubRepositorySearchUrl({
  query,
  context,
  perPage,
  apiBaseUrl = DEFAULT_GITHUB_API_BASE_URL,
}: GitHubRepositorySearchUrlOptions): string {
  const url = new URL(apiBaseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/search/repositories`;
  url.searchParams.set("q", buildGitHubRepositoryQuery(query, context));
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(requestedPerPage(query, perPage)));
  return url.toString();
}

function requestHeaders(token?: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function defaultFetchJson(
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `GitHub API request failed: ${response.status} ${body || response.statusText}`,
    );
  }
  return response.json();
}

function isRepositoryApiItem(value: unknown): value is GitHubRepositoryApiItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const repo = value as Partial<GitHubRepositoryApiItem>;
  return (
    typeof repo.id === "number" &&
    typeof repo.full_name === "string" &&
    typeof repo.html_url === "string" &&
    typeof repo.stargazers_count === "number"
  );
}

function repositoryItemsFromResponse(
  value: unknown,
): GitHubRepositoryApiItem[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  const response = value as GitHubRepositorySearchResponse;
  return Array.isArray(response.items)
    ? response.items.filter(isRepositoryApiItem)
    : [];
}

export function mapGitHubRepositoryToResourceItem(
  repo: GitHubRepositoryApiItem,
): ResourceItem {
  return {
    id: `github:${repo.id}`,
    sourceId: "github",
    title: repo.full_name,
    url: repo.html_url,
    kind: "repo",
    summary: repo.description ?? undefined,
    score: repo.stargazers_count,
    metadata: {
      stars: repo.stargazers_count,
      language: repo.language,
      topics: repo.topics ?? [],
      updatedAt: repo.updated_at ?? null,
      archived: repo.archived ?? false,
      fork: repo.fork ?? false,
    },
  };
}

export function createGitHubResourceSource({
  enabled = true,
  token = null,
  perPage,
  apiBaseUrl,
  fetchJson = defaultFetchJson,
}: GitHubResourceSourceOptions = {}): ResourceSource {
  return {
    id: "github",
    label: "GitHub",
    enabled,
    async search(query, context) {
      if (typeof query.limit === "number" && query.limit <= 0) {
        return [];
      }

      const url = buildGitHubRepositorySearchUrl({
        query,
        context,
        perPage,
        apiBaseUrl,
      });
      const response = await fetchJson(url, {
        method: "GET",
        headers: requestHeaders(token),
      });

      return repositoryItemsFromResponse(response)
        .map(mapGitHubRepositoryToResourceItem)
        .slice(0, query.limit ?? perPage ?? DEFAULT_PER_PAGE);
    },
  };
}
