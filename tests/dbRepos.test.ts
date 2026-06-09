import { describe, expect, it } from "vitest";
import { createEvidenceRepository } from "@/db/evidenceRepo";
import { createPortraitRepository } from "@/db/portraitRepo";
import { createReadingListRepository } from "@/db/readingListRepo";
import type { QueryResult, SqlExecutor } from "@/db/types";
import type { NewEvidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";
import type { NewReadingListItem } from "@/types/readingList";

interface SqlCall {
  query: string;
  bindValues?: unknown[];
}

class MockDb implements SqlExecutor {
  executeCalls: SqlCall[] = [];
  selectCalls: SqlCall[] = [];

  constructor(
    private executeResults: QueryResult[] = [],
    private selectResults: unknown[] = [],
  ) {}

  async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    this.executeCalls.push({ query, bindValues });
    return this.executeResults.shift() ?? { rowsAffected: 0 };
  }

  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    this.selectCalls.push({ query, bindValues });
    return (this.selectResults.shift() ?? []) as T;
  }
}

function portrait(overrides: Partial<Portrait> = {}): Portrait {
  return {
    scope: "domain",
    domain: "computer_science",
    portraitVersion: 4,
    updatedAt: "2026-06-09T00:00:00.000Z",
    confidence: 0.66,
    dimensions: {
      mastery: {
        score: 0.58,
        confidence: 0.75,
        summary: "复杂度分析仍弱，但基础概念有提升",
        evidenceIds: [1, 3],
      },
    },
    nextFocus: "递归复杂度",
    changeSummary: "mastery 因新测验结果小幅上调",
    ...overrides,
  };
}

function newEvidence(overrides: Partial<NewEvidence> = {}): NewEvidence {
  return {
    domain: "computer_science",
    type: "quiz",
    summary: "复杂度小测 6/10",
    payload: { score: 0.6, topic: "complexity" },
    createdAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

function newReadingListItem(
  overrides: Partial<NewReadingListItem> = {},
): NewReadingListItem {
  return {
    domain: "computer_science",
    sourceId: "tutor:evidence-12:0:doc",
    title: "k8s 入门资料",
    url: null,
    kind: "doc",
    status: "todo",
    addedAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("portraitRepository", () => {
  it("save 写入 portrait_versions 并返回插入记录", async () => {
    const db = new MockDb([{ rowsAffected: 1, lastInsertId: 12 }]);
    const repo = createPortraitRepository(db);
    const input = portrait();

    const saved = await repo.save(input);

    expect(saved.id).toBe(12);
    expect(saved.domainId).toBe("computer_science");
    expect(saved.version).toBe(4);
    expect(saved.portrait).toEqual(input);
    expect(db.executeCalls[0].query).toContain("INSERT INTO portrait_versions");
    expect(db.executeCalls[0].bindValues).toEqual([
      "computer_science",
      4,
      JSON.stringify(input),
      0.66,
      "2026-06-09T00:00:00.000Z",
      "mastery 因新测验结果小幅上调",
    ]);
  });

  it("getLatest 解析 portrait_json 并映射 snake_case 字段", async () => {
    const input = portrait({ portraitVersion: 2 });
    const db = new MockDb([], [
      [
        {
          id: 7,
          domain_id: "computer_science",
          version: 2,
          portrait_json: JSON.stringify(input),
          confidence: 0.66,
          created_at: "2026-06-09T00:00:00.000Z",
          change_summary: "changed",
        },
      ],
    ]);

    const latest = await createPortraitRepository(db).getLatest("computer_science");

    expect(latest?.id).toBe(7);
    expect(latest?.domainId).toBe("computer_science");
    expect(latest?.portrait.portraitVersion).toBe(2);
    expect(db.selectCalls[0].query).toContain("ORDER BY version DESC");
    expect(db.selectCalls[0].bindValues).toEqual(["computer_science"]);
  });

  it("nextVersion 基于当前最大版本递增", async () => {
    const db = new MockDb([], [[{ max_version: 4 }], [{ max_version: null }]]);
    const repo = createPortraitRepository(db);

    await expect(repo.nextVersion("computer_science")).resolves.toBe(5);
    await expect(repo.nextVersion("new_domain")).resolves.toBe(1);
  });
});

describe("evidenceRepository", () => {
  it("insert 写入 evidence 并返回带 id 的证据", async () => {
    const db = new MockDb([{ rowsAffected: 1, lastInsertId: 21 }]);
    const repo = createEvidenceRepository(db);
    const input = newEvidence();

    const inserted = await repo.insert(input);

    expect(inserted.id).toBe(21);
    expect(inserted.consumedInVersion).toBeNull();
    expect(db.executeCalls[0].query).toContain("INSERT INTO evidence");
    expect(db.executeCalls[0].bindValues).toEqual([
      "computer_science",
      "quiz",
      "复杂度小测 6/10",
      JSON.stringify({ score: 0.6, topic: "complexity" }),
      "2026-06-09T00:00:00.000Z",
    ]);
  });

  it("listUnconsumed 解析 payload 并按创建时间读取", async () => {
    const db = new MockDb([], [
      [
        {
          id: 21,
          domain_id: "computer_science",
          type: "quiz",
          summary: "复杂度小测 6/10",
          payload: JSON.stringify({ score: 0.6 }),
          created_at: "2026-06-09T00:00:00.000Z",
          consumed_in_version: null,
        },
      ],
    ]);

    const rows = await createEvidenceRepository(db).listUnconsumed("computer_science", 5);

    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({ score: 0.6 });
    expect(db.selectCalls[0].query).toContain("consumed_in_version IS NULL");
    expect(db.selectCalls[0].query).toContain("LIMIT $2");
    expect(db.selectCalls[0].bindValues).toEqual(["computer_science", 5]);
  });

  it("markConsumed 空 id 不写库，非空 id 批量更新", async () => {
    const db = new MockDb([{ rowsAffected: 2 }]);
    const repo = createEvidenceRepository(db);

    await expect(repo.markConsumed([], 4)).resolves.toBe(0);
    await expect(repo.markConsumed([21, 22], 4)).resolves.toBe(2);

    expect(db.executeCalls).toHaveLength(1);
    expect(db.executeCalls[0].query).toContain("WHERE id IN ($2, $3)");
    expect(db.executeCalls[0].bindValues).toEqual([4, 21, 22]);
  });
});

describe("readingListRepository", () => {
  it("insert 写入 reading_list 并返回带 id 的书单项", async () => {
    const db = new MockDb([{ rowsAffected: 1, lastInsertId: 31 }]);
    const repo = createReadingListRepository(db);
    const input = newReadingListItem();

    const inserted = await repo.insert(input);

    expect(inserted.id).toBe(31);
    expect(inserted.status).toBe("todo");
    expect(db.executeCalls[0].query).toContain("INSERT INTO reading_list");
    expect(db.executeCalls[0].bindValues).toEqual([
      "computer_science",
      "tutor:evidence-12:0:doc",
      "k8s 入门资料",
      null,
      "doc",
      "todo",
      "2026-06-09T00:00:00.000Z",
      null,
      0,
    ]);
  });

  it("listByDomain 映射 snake_case 字段并按 added_at 倒序读取", async () => {
    const db = new MockDb([], [
      [
        {
          id: 31,
          domain_id: "computer_science",
          source_id: "tutor:evidence-12:0:doc",
          title: "k8s 入门资料",
          url: null,
          kind: "doc",
          status: "todo",
          added_at: "2026-06-09T00:00:00.000Z",
          read_at: null,
          dwell_seconds: 0,
        },
      ],
    ]);

    const rows = await createReadingListRepository(db).listByDomain("computer_science");

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("k8s 入门资料");
    expect(db.selectCalls[0].query).toContain("ORDER BY added_at DESC");
    expect(db.selectCalls[0].bindValues).toEqual(["computer_science"]);
  });
});
