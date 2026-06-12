import { describe, expect, it, vi } from "vitest";
import {
  addManualReadingListItem,
  addTutorResourceSuggestions,
  buildManualReadingListItemInput,
  changeReadingListItemStatus,
  groupReadingListItems,
  loadReadingList,
  loadReadingListOverview,
  summarizeReadingList,
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
    updateStatus: vi.fn(async (id, input) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) {
        return null;
      }
      rows[index] = {
        ...rows[index],
        status: input.status,
        readAt: input.readAt,
        dwellSeconds: input.dwellSeconds,
      };
      return rows[index];
    }),
  };
}

describe("reading-list feature", () => {
  it("构建手动资料输入时标准化链接并推断标题", () => {
    const input = buildManualReadingListItemInput({
      domain: "computer_science",
      url: "kubernetes.io/docs/",
      addedAt: "2026-06-11T12:00:00.000Z",
    });

    expect(input).toEqual({
      domain: "computer_science",
      sourceId: "manual:2026-06-11T12:00:00.000Z",
      title: "kubernetes.io/docs",
      url: "https://kubernetes.io/docs/",
      kind: "doc",
      status: "todo",
      addedAt: "2026-06-11T12:00:00.000Z",
    });
  });

  it("手动资料只接受 http/https 链接", () => {
    expect(() =>
      buildManualReadingListItemInput({
        domain: "computer_science",
        url: "ftp://example.com/file",
        addedAt: "2026-06-11T12:00:00.000Z",
      }),
    ).toThrow("资料链接只支持 http 或 https");
  });

  it("把手动资料链接写入待读书单", async () => {
    const repo = repository();

    const inserted = await addManualReadingListItem({
      domain: "computer_science",
      repository: repo,
      title: "Kubernetes 官方文档",
      url: "https://kubernetes.io/docs/",
      now: () => "2026-06-11T12:00:00.000Z",
    });

    expect(inserted).toEqual({
      id: 1,
      title: "Kubernetes 官方文档",
      kind: "doc",
      status: "todo",
      url: "https://kubernetes.io/docs/",
      addedAt: "2026-06-11T12:00:00.000Z",
    });
    expect(repo.insert).toHaveBeenCalledWith({
      domain: "computer_science",
      sourceId: "manual:2026-06-11T12:00:00.000Z",
      title: "Kubernetes 官方文档",
      url: "https://kubernetes.io/docs/",
      kind: "doc",
      status: "todo",
      addedAt: "2026-06-11T12:00:00.000Z",
    });
  });

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

  it("汇总书单状态和已读停留时长", () => {
    const summary = summarizeReadingList([
      {
        id: 1,
        domain: "computer_science",
        sourceId: null,
        title: "A",
        url: null,
        kind: "doc",
        status: "todo",
        addedAt: "2026-06-09T08:00:00.000Z",
        readAt: null,
        dwellSeconds: 0,
      },
      {
        id: 2,
        domain: "computer_science",
        sourceId: null,
        title: "B",
        url: null,
        kind: "article",
        status: "done",
        addedAt: "2026-06-09T08:01:00.000Z",
        readAt: "2026-06-09T08:05:00.000Z",
        dwellSeconds: 120,
      },
      {
        id: 3,
        domain: "computer_science",
        sourceId: null,
        title: "C",
        url: null,
        kind: "video",
        status: "later",
        addedAt: "2026-06-09T08:02:00.000Z",
        readAt: null,
        dwellSeconds: 90,
      },
    ]);

    expect(summary).toEqual({
      total: 3,
      byStatus: {
        todo: 1,
        reading: 0,
        done: 1,
        later: 1,
      },
      doneDwellSeconds: 120,
    });
  });

  it("一次读取书单列表和摘要", async () => {
    const repo = repository([
      {
        id: 3,
        domain: "computer_science",
        sourceId: "manual",
        title: "Kubernetes 文档",
        url: "https://kubernetes.io/docs/",
        kind: "doc",
        status: "done",
        addedAt: "2026-06-09T08:00:00.000Z",
        readAt: "2026-06-09T08:30:00.000Z",
        dwellSeconds: 180,
      },
    ]);

    const overview = await loadReadingListOverview({
      domain: "computer_science",
      repository: repo,
    });

    expect(overview.items).toHaveLength(1);
    expect(overview.groups.find((group) => group.status === "done")?.items).toHaveLength(1);
    expect(overview.summary.byStatus.done).toBe(1);
    expect(overview.summary.doneDwellSeconds).toBe(180);
  });

  it("按稳定状态顺序输出书单分组", () => {
    const groups = groupReadingListItems([
      {
        id: 1,
        title: "已读资料",
        kind: "doc",
        status: "done",
        url: null,
        addedAt: "2026-06-09T08:00:00.000Z",
      },
      {
        id: 2,
        title: "待读资料",
        kind: "article",
        status: "todo",
        url: null,
        addedAt: "2026-06-09T08:01:00.000Z",
      },
    ]);

    expect(groups.map((group) => group.status)).toEqual([
      "todo",
      "reading",
      "later",
      "done",
    ]);
    expect(groups[0].label).toBe("待读");
    expect(groups[0].items.map((item) => item.title)).toEqual(["待读资料"]);
    expect(groups[3].items.map((item) => item.title)).toEqual(["已读资料"]);
  });

  it("更新书单状态并写回 reading evidence", async () => {
    const repo = repository([
      {
        id: 5,
        domain: "computer_science",
        sourceId: "tutor:evidence-12:0:doc",
        title: "Service Mesh Guide",
        url: "https://example.com/service-mesh",
        kind: "article",
        status: "todo",
        addedAt: "2026-06-09T08:00:00.000Z",
        readAt: null,
        dwellSeconds: 0,
      },
    ]);
    const recordReading = vi.fn(async () => ({
      evidence: {
        id: 41,
        domain: "computer_science",
        type: "reading" as const,
        summary: "阅读 Service Mesh Guide：done",
        payload: {},
        createdAt: "2026-06-09T08:10:00.000Z",
        consumedInVersion: null,
      },
      update: {
        status: "skipped" as const,
        reason: "trigger_not_met" as const,
        trigger: {
          shouldRun: false as const,
          reason: "evidence_count" as const,
          evidenceCount: 1,
        },
        latest: null,
        consumedEvidenceIds: [],
      },
    }));

    const result = await changeReadingListItemStatus({
      id: 5,
      status: "done",
      repository: repo,
      learningEvents: { recordReading },
      dwellSeconds: 90,
      now: () => "2026-06-09T08:10:00.000Z",
    });

    expect(result.item.status).toBe("done");
    expect(repo.updateStatus).toHaveBeenCalledWith(5, {
      status: "done",
      readAt: "2026-06-09T08:10:00.000Z",
      dwellSeconds: 90,
    });
    expect(recordReading).toHaveBeenCalledWith({
      domain: "computer_science",
      title: "Service Mesh Guide",
      url: "https://example.com/service-mesh",
      status: "done",
      dwellSeconds: 90,
    });
    expect(result.learning?.evidence.id).toBe(41);
  });
});
