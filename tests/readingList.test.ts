import { describe, expect, it, vi } from "vitest";
import {
  addTutorResourceSuggestions,
  loadReadingList,
} from "@/features/reading-list";
import type { ReadingListRepository } from "@/db/readingListRepo";
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
  };
}

describe("reading-list feature", () => {
  it("把 tutor 资源建议写入待读书单", async () => {
    const repo = repository();

    const inserted = await addTutorResourceSuggestions({
      domain: "computer_science",
      repository: repo,
      evidenceId: 12,
      now: () => "2026-06-09T08:00:00.000Z",
      suggestions: [
        {
          title: "service mesh 入门资料",
          kind: "doc",
          reason: "本轮问题建议",
        },
      ],
    });

    expect(inserted).toEqual([
      {
        id: 1,
        title: "service mesh 入门资料",
        kind: "doc",
        status: "todo",
        url: null,
        addedAt: "2026-06-09T08:00:00.000Z",
      },
    ]);
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "computer_science",
        sourceId: "tutor:evidence-12:0:doc",
        title: "service mesh 入门资料",
        status: "todo",
      }),
    );
  });

  it("读取当前 domain 的书单视图", async () => {
    const repo = repository([
      {
        id: 3,
        domain: "computer_science",
        sourceId: "manual",
        title: "Kubernetes 文档",
        url: "https://kubernetes.io/docs/",
        kind: "doc",
        status: "todo",
        addedAt: "2026-06-09T08:00:00.000Z",
        readAt: null,
        dwellSeconds: 0,
      },
    ]);

    const items = await loadReadingList({
      domain: "computer_science",
      repository: repo,
    });

    expect(items).toEqual([
      {
        id: 3,
        title: "Kubernetes 文档",
        kind: "doc",
        status: "todo",
        url: "https://kubernetes.io/docs/",
        addedAt: "2026-06-09T08:00:00.000Z",
      },
    ]);
  });
});
