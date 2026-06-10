import { describe, expect, it } from "vitest";
import { createEvidenceRepository } from "@/db/evidenceRepo";
import { createPortraitRepository } from "@/db/portraitRepo";
import { createRankerWeightRepository } from "@/db/rankerWeightRepo";
import { createRecommendationRepository } from "@/db/recommendationRepo";
import { createReadingListRepository } from "@/db/readingListRepo";
import { createTutorSessionRepository } from "@/db/tutorSessionRepo";
import type { QueryResult, SqlExecutor } from "@/db/types";
import type { NewEvidence } from "@/types/evidence";
import type { Portrait } from "@/types/portrait";
import type { NewReadingListItem } from "@/types/readingList";
import type { NewRecommendation } from "@/types/recommendation";

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

function newRecommendation(
  overrides: Partial<NewRecommendation> = {},
): NewRecommendation {
  return {
    domain: "computer_science",
    kind: "learn",
    topic: "k8s networking",
    reason: "next focus",
    features: {
      interest_match: 0.8,
      novelty: 0.4,
    },
    score: 1.6,
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

  it("updateStatus 更新状态并返回最新书单项", async () => {
    const db = new MockDb([{ rowsAffected: 1 }], [
      [
        {
          id: 31,
          domain_id: "computer_science",
          source_id: "tutor:evidence-12:0:doc",
          title: "k8s 入门资料",
          url: null,
          kind: "doc",
          status: "done",
          added_at: "2026-06-09T00:00:00.000Z",
          read_at: "2026-06-09T00:10:00.000Z",
          dwell_seconds: 120,
        },
      ],
    ]);

    const row = await createReadingListRepository(db).updateStatus(31, {
      status: "done",
      readAt: "2026-06-09T00:10:00.000Z",
      dwellSeconds: 120,
    });

    expect(row?.status).toBe("done");
    expect(row?.readAt).toBe("2026-06-09T00:10:00.000Z");
    expect(db.executeCalls[0].query).toContain("UPDATE reading_list");
    expect(db.executeCalls[0].bindValues).toEqual([
      31,
      "done",
      "2026-06-09T00:10:00.000Z",
      120,
    ]);
    expect(db.selectCalls[0].bindValues).toEqual([31]);
  });
});

describe("rankerWeightRepository", () => {
  it("list 读取已知特征权重并过滤未知特征", async () => {
    const db = new MockDb([], [
      [
        {
          feature: "interest_match",
          weight: 1.4,
          updated_at: "2026-06-09T10:00:00.000Z",
        },
        {
          feature: "unknown_feature",
          weight: 9,
          updated_at: "2026-06-09T10:00:00.000Z",
        },
      ],
    ]);

    const rows = await createRankerWeightRepository(db).list();

    expect(rows).toEqual([
      {
        feature: "interest_match",
        weight: 1.4,
        updatedAt: "2026-06-09T10:00:00.000Z",
      },
    ]);
    expect(db.selectCalls[0].query).toContain("FROM ranker_weights");
  });

  it("getWeights 返回 feature 到 weight 的映射", async () => {
    const db = new MockDb([], [
      [
        {
          feature: "interest_match",
          weight: 1.4,
          updated_at: "2026-06-09T10:00:00.000Z",
        },
        {
          feature: "novelty",
          weight: 0.7,
          updated_at: "2026-06-09T10:00:00.000Z",
        },
      ],
    ]);

    const weights = await createRankerWeightRepository(db).getWeights();

    expect(weights).toEqual({
      interest_match: 1.4,
      novelty: 0.7,
    });
  });

  it("upsertMany 只写入已知且有数值的权重", async () => {
    const db = new MockDb([{ rowsAffected: 1 }, { rowsAffected: 1 }]);
    const repo = createRankerWeightRepository(db);

    await repo.upsertMany(
      {
        interest_match: 1.5,
        novelty: 0.8,
      },
      "2026-06-09T10:00:00.000Z",
    );

    expect(db.executeCalls).toHaveLength(2);
    expect(db.executeCalls[0].query).toContain("ON CONFLICT(feature)");
    expect(db.executeCalls.map((call) => call.bindValues)).toEqual([
      ["interest_match", 1.5, "2026-06-09T10:00:00.000Z"],
      ["novelty", 0.8, "2026-06-09T10:00:00.000Z"],
    ]);
  });
});

describe("recommendationRepository", () => {
  it("insert 写入 recommendations 并返回带 id 的候选", async () => {
    const db = new MockDb([{ rowsAffected: 1, lastInsertId: 51 }]);
    const repo = createRecommendationRepository(db);
    const input = newRecommendation();

    const inserted = await repo.insert(input);

    expect(inserted.id).toBe(51);
    expect(inserted.domain).toBe("computer_science");
    expect(inserted.clicked).toBe(false);
    expect(db.executeCalls[0].query).toContain("INSERT INTO recommendations");
    expect(db.executeCalls[0].bindValues).toEqual([
      "computer_science",
      "learn",
      "k8s networking",
      "next focus",
      JSON.stringify({
        interest_match: 0.8,
        novelty: 0.4,
      }),
      1.6,
    ]);
  });

  it("listByDomain 解析 features_json 和反馈字段", async () => {
    const db = new MockDb([], [
      [
        {
          id: 51,
          domain_id: "computer_science",
          kind: "read",
          topic: "K8s intro",
          reason: "reading list",
          features_json: JSON.stringify({ novelty: 0.6 }),
          score: 1.1,
          shown_at: "2026-06-09T10:00:00.000Z",
          clicked: 1,
          dwell_seconds: 120,
          skipped: 0,
        },
      ],
    ]);

    const rows = await createRecommendationRepository(db).listByDomain(
      "computer_science",
      5,
    );

    expect(rows).toEqual([
      {
        id: 51,
        domain: "computer_science",
        kind: "read",
        topic: "K8s intro",
        reason: "reading list",
        features: { novelty: 0.6 },
        score: 1.1,
        shownAt: "2026-06-09T10:00:00.000Z",
        clicked: true,
        dwellSeconds: 120,
        skipped: false,
      },
    ]);
    expect(db.selectCalls[0].query).toContain("WHERE domain_id = $1");
    expect(db.selectCalls[0].query).toContain("LIMIT $2");
    expect(db.selectCalls[0].bindValues).toEqual(["computer_science", 5]);
  });

  it("markShown/markClicked/markSkipped 更新反馈字段", async () => {
    const db = new MockDb([
      { rowsAffected: 1 },
      { rowsAffected: 1 },
      { rowsAffected: 1 },
    ]);
    const repo = createRecommendationRepository(db);

    await repo.markShown(51, "2026-06-09T10:00:00.000Z");
    await repo.markClicked(51, 90);
    await repo.markSkipped(51);

    expect(db.executeCalls[0].query).toContain("SET shown_at = $2");
    expect(db.executeCalls[0].bindValues).toEqual([
      51,
      "2026-06-09T10:00:00.000Z",
    ]);
    expect(db.executeCalls[1].query).toContain("clicked = 1");
    expect(db.executeCalls[1].bindValues).toEqual([51, 90]);
    expect(db.executeCalls[2].query).toContain("skipped = 1");
    expect(db.executeCalls[2].bindValues).toEqual([51]);
  });

  it("upsertCandidate 已存在时更新候选字段并保留反馈状态", async () => {
    const db = new MockDb([{ rowsAffected: 1 }], [
      [
        {
          id: 51,
          domain_id: "computer_science",
          kind: "learn",
          topic: "k8s networking",
          reason: "old reason",
          features_json: JSON.stringify({ novelty: 0.2 }),
          score: 0.5,
          shown_at: "2026-06-09T10:00:00.000Z",
          clicked: 1,
          dwell_seconds: 90,
          skipped: 0,
        },
      ],
    ]);

    const saved = await createRecommendationRepository(db).upsertCandidate(
      newRecommendation({
        reason: "new reason",
        features: { interest_match: 0.9 },
        score: 2,
      }),
    );

    expect(saved.id).toBe(51);
    expect(saved.reason).toBe("new reason");
    expect(saved.features).toEqual({ interest_match: 0.9 });
    expect(saved.clicked).toBe(true);
    expect(saved.dwellSeconds).toBe(90);
    expect(db.selectCalls[0].query).toContain("kind = $2 AND topic = $3");
    expect(db.executeCalls[0].query).toContain("UPDATE recommendations");
    expect(db.executeCalls[0].bindValues).toEqual([
      51,
      "new reason",
      JSON.stringify({ interest_match: 0.9 }),
      2,
    ]);
  });
});

describe("tutorSessionRepository", () => {
  it("createSession 写入 sessions 并返回 id", async () => {
    const db = new MockDb([{ rowsAffected: 1, lastInsertId: 42 }]);
    const repo = createTutorSessionRepository(db);

    const session = await repo.createSession({
      domain: "computer_science",
      title: "k8s 入门",
      createdAt: "2026-06-09T09:00:00.000Z",
      updatedAt: "2026-06-09T09:00:00.000Z",
    });

    expect(session.id).toBe(42);
    expect(db.executeCalls[0].query).toContain("INSERT INTO sessions");
    expect(db.executeCalls[0].bindValues).toEqual([
      "computer_science",
      "k8s 入门",
      "2026-06-09T09:00:00.000Z",
      "2026-06-09T09:00:00.000Z",
    ]);
  });

  it("getLatestByDomain 读取最近会话", async () => {
    const db = new MockDb([], [
      [
        {
          id: 42,
          domain_id: "computer_science",
          title: "k8s 入门",
          created_at: "2026-06-09T09:00:00.000Z",
          updated_at: "2026-06-09T09:01:00.000Z",
        },
      ],
    ]);

    const session = await createTutorSessionRepository(db).getLatestByDomain(
      "computer_science",
    );

    expect(session?.id).toBe(42);
    expect(db.selectCalls[0].query).toContain("ORDER BY updated_at DESC");
    expect(db.selectCalls[0].bindValues).toEqual(["computer_science"]);
  });

  it("insertMessage 写入 messages 并按 session 读取", async () => {
    const db = new MockDb([{ rowsAffected: 1, lastInsertId: 77 }], [
      [
        {
          id: 77,
          session_id: 42,
          role: "assistant",
          content: "回复",
          created_at: "2026-06-09T09:01:00.000Z",
        },
      ],
    ]);
    const repo = createTutorSessionRepository(db);

    const message = await repo.insertMessage({
      sessionId: 42,
      role: "assistant",
      content: "回复",
      createdAt: "2026-06-09T09:01:00.000Z",
    });
    const messages = await repo.listMessages(42);

    expect(message.id).toBe(77);
    expect(db.executeCalls[0].query).toContain("INSERT INTO messages");
    expect(db.executeCalls[0].bindValues).toEqual([
      42,
      "assistant",
      "回复",
      "2026-06-09T09:01:00.000Z",
    ]);
    expect(messages).toEqual([
      {
        id: 77,
        sessionId: 42,
        role: "assistant",
        content: "回复",
        createdAt: "2026-06-09T09:01:00.000Z",
      },
    ]);
  });
});
