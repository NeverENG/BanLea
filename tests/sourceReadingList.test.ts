import { describe, expect, it, vi } from "vitest";
import {
  addResourceItemsToReadingList,
  addTutorResourceSuggestions,
  resourceItemToTutorResourceSuggestion,
  resourceItemsToReadingListItems,
  resourceItemsToTutorResourceSuggestions,
} from "@/features/reading-list";
import type { ReadingListRepository } from "@/db/readingListRepo";
import type { ResourceItem } from "@/core/sources";
import type { NewReadingListItem, ReadingListItem } from "@/types/readingList";

function repository(initial: ReadingListItem[] = []): ReadingListRepository {
  const rows = [...initial];
  return {
    insert: vi.fn(async (input: NewReadingListItem) => {
      const row: ReadingListItem = {
        sourceId: null,
        url: null,
        kind: "doc",
        status: "todo",
        readAt: null,
        dwellSeconds: 0,
        ...input,
        id: rows.length + 1,
      };
      rows.push(row);
      return row;
    }),
    listByDomain: vi.fn(async (domainId: string) =>
      rows.filter((row) => row.domain === domainId),
    ),
    updateStatus: vi.fn(async () => null),
  };
}

const repoResource: ResourceItem = {
  id: "github:12345",
  sourceId: "github",
  title: "learning-rust/rust-by-example",
  url: "https://github.com/learning-rust/rust-by-example",
  kind: "repo",
  summary: "Practical Rust examples",
  metadata: {
    stars: 42_000,
    language: "Rust",
  },
};

const paperResource: ResourceItem = {
  id: "arxiv:2606.00001",
  sourceId: "arxiv",
  title: "A survey of local-first learning systems",
  url: "https://arxiv.org/abs/2606.00001",
  kind: "paper",
};

describe("source items for reading list", () => {
  it("converts resource items to tutor suggestions with source trace", () => {
    expect(resourceItemToTutorResourceSuggestion(repoResource)).toEqual({
      sourceId: "github:12345",
      title: "learning-rust/rust-by-example",
      kind: "repo",
      url: "https://github.com/learning-rust/rust-by-example",
      reason:
        "Practical Rust examples · source: github · 42000 stars · Rust",
    });
  });

  it("converts resource items to reading list insert rows", () => {
    expect(
      resourceItemsToReadingListItems({
        domain: "computer_science",
        items: [paperResource, repoResource],
        addedAt: "2026-06-10T12:00:00.000Z",
        limit: 1,
        status: "later",
      }),
    ).toEqual([
      {
        domain: "computer_science",
        sourceId: "arxiv:2606.00001",
        title: "A survey of local-first learning systems",
        url: "https://arxiv.org/abs/2606.00001",
        kind: "article",
        status: "later",
        addedAt: "2026-06-10T12:00:00.000Z",
      },
    ]);
  });

  it("adds resource items to reading list directly", async () => {
    const repo = repository();

    const items = await addResourceItemsToReadingList({
      domain: "computer_science",
      items: [repoResource],
      repository: repo,
      now: () => "2026-06-10T12:05:00.000Z",
    });

    expect(items).toEqual([
      {
        id: 1,
        title: "learning-rust/rust-by-example",
        kind: "repo",
        status: "todo",
        url: "https://github.com/learning-rust/rust-by-example",
        addedAt: "2026-06-10T12:05:00.000Z",
      },
    ]);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "computer_science",
        sourceId: "github:12345",
        kind: "repo",
      }),
    );
  });

  it("deduplicates resource items before direct insert", async () => {
    const repo = repository();
    const duplicateUrl: ResourceItem = {
      ...repoResource,
      id: "github:duplicate-url",
    };

    const items = await addResourceItemsToReadingList({
      domain: "computer_science",
      items: [repoResource, duplicateUrl],
      repository: repo,
      now: () => "2026-06-10T12:05:00.000Z",
    });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("learning-rust/rust-by-example");
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it("skips resource items already in the current domain", async () => {
    const repo = repository([
      {
        id: 4,
        domain: "computer_science",
        sourceId: "github:12345",
        title: "existing repo",
        url: "https://github.com/learning-rust/rust-by-example",
        kind: "repo",
        status: "todo",
        addedAt: "2026-06-10T12:00:00.000Z",
        readAt: null,
        dwellSeconds: 0,
      },
    ]);

    const items = await addResourceItemsToReadingList({
      domain: "computer_science",
      items: [repoResource],
      repository: repo,
      now: () => "2026-06-10T12:05:00.000Z",
    });

    expect(items).toEqual([]);
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it("keeps source id when source-backed tutor suggestions are saved", async () => {
    const repo = repository();
    const suggestions = resourceItemsToTutorResourceSuggestions([repoResource]);

    await addTutorResourceSuggestions({
      domain: "computer_science",
      suggestions,
      repository: repo,
      evidenceId: 12,
      now: () => "2026-06-10T12:10:00.000Z",
    });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "github:12345",
        title: "learning-rust/rust-by-example",
      }),
    );
  });

  it("skips duplicate source-backed tutor suggestions", async () => {
    const repo = repository([
      {
        id: 5,
        domain: "computer_science",
        sourceId: "github:12345",
        title: "existing repo",
        url: "https://github.com/learning-rust/rust-by-example",
        kind: "repo",
        status: "todo",
        addedAt: "2026-06-10T12:00:00.000Z",
        readAt: null,
        dwellSeconds: 0,
      },
    ]);
    const suggestions = resourceItemsToTutorResourceSuggestions([repoResource]);

    const inserted = await addTutorResourceSuggestions({
      domain: "computer_science",
      suggestions,
      repository: repo,
      evidenceId: 12,
      now: () => "2026-06-10T12:10:00.000Z",
    });

    expect(inserted).toEqual([]);
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
