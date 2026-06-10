import { describe, expect, it } from "vitest";
import {
  buildGitHubRepositoryQuery,
  createGitHubResourceSource,
  mapGitHubRepositoryToResourceItem,
  type GitHubFetchJson,
  type GitHubRepositoryApiItem,
} from "@/core/sources";

const repo: GitHubRepositoryApiItem = {
  id: 12_345,
  full_name: "learning-rust/rust-by-example",
  html_url: "https://github.com/learning-rust/rust-by-example",
  description: "Practical Rust examples",
  stargazers_count: 42_000,
  language: "Rust",
  topics: ["rust", "examples"],
  updated_at: "2026-05-01T00:00:00Z",
  archived: false,
  fork: false,
};

describe("GitHub resource source", () => {
  it("builds repository search queries with learning topic and safe qualifiers", () => {
    const query = buildGitHubRepositoryQuery(
      {
        topic: "Rust ownership",
        intent: "practice",
      },
      {
        domain: "computer_science",
        language: "TypeScript",
      },
    );

    expect(query).toContain("Rust ownership");
    expect(query).toContain("example");
    expect(query).toContain("in:name,description,readme");
    expect(query).toContain("archived:false");
    expect(query).toContain("language:TypeScript");
  });

  it("calls GitHub repository search with official headers and limit", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchJson: GitHubFetchJson = async (url, init) => {
      calls.push({ url, init });
      return { items: [repo] };
    };
    const source = createGitHubResourceSource({
      token: "ghp_test",
      perPage: 5,
      fetchJson,
    });

    const items = await source.search(
      {
        topic: "rust ownership",
        limit: 2,
      },
      {
        domain: "computer_science",
        language: "Rust",
      },
    );

    expect(items).toHaveLength(1);
    expect(calls).toHaveLength(1);

    const url = new URL(calls[0].url);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.github.com/search/repositories",
    );
    expect(url.searchParams.get("q")).toContain("rust ownership");
    expect(url.searchParams.get("sort")).toBe("stars");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("per_page")).toBe("2");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers.Authorization).toBe("Bearer ghp_test");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("maps GitHub repositories to reusable resource items", () => {
    expect(mapGitHubRepositoryToResourceItem(repo)).toEqual({
      id: "github:12345",
      sourceId: "github",
      title: "learning-rust/rust-by-example",
      url: "https://github.com/learning-rust/rust-by-example",
      kind: "repo",
      summary: "Practical Rust examples",
      score: 42_000,
      metadata: {
        stars: 42_000,
        language: "Rust",
        topics: ["rust", "examples"],
        updatedAt: "2026-05-01T00:00:00Z",
        archived: false,
        fork: false,
      },
    });
  });
});
