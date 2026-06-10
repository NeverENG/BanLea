import {
  newRecommendationSchema,
  recommendationSchema,
  type NewRecommendation,
  type Recommendation,
  type RecommendationKind,
} from "@/types/recommendation";
import type { SqlExecutor } from "./types";

interface RecommendationRow {
  id: number;
  domain_id: string;
  kind: RecommendationKind;
  topic: string;
  reason: string | null;
  features_json: string;
  score: number;
  shown_at: string | null;
  clicked: number;
  dwell_seconds: number;
  skipped: number;
}

export interface RecommendationRepository {
  insert(input: NewRecommendation): Promise<Recommendation>;
  getByDomainKindTopic(
    domain: string,
    kind: RecommendationKind,
    topic: string,
  ): Promise<Recommendation | null>;
  listByDomain(domain: string, limit?: number): Promise<Recommendation[]>;
  upsertCandidate(input: NewRecommendation): Promise<Recommendation>;
  markShown(id: number, shownAt: string): Promise<void>;
  markClicked(id: number, dwellSeconds: number): Promise<void>;
  markSkipped(id: number): Promise<void>;
}

function requireInsertId(lastInsertId: number | undefined, table: string): number {
  if (typeof lastInsertId !== "number") {
    throw new Error(`${table} insert did not return lastInsertId`);
  }
  return lastInsertId;
}

function parseFeatures(features: string): Record<string, unknown> {
  const parsed = JSON.parse(features) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("recommendation features_json must be a JSON object");
}

function parseRecommendationRow(row: RecommendationRow): Recommendation {
  return recommendationSchema.parse({
    id: row.id,
    domain: row.domain_id,
    kind: row.kind,
    topic: row.topic,
    reason: row.reason ?? undefined,
    features: parseFeatures(row.features_json),
    score: row.score,
    shownAt: row.shown_at,
    clicked: row.clicked === 1,
    dwellSeconds: row.dwell_seconds,
    skipped: row.skipped === 1,
  });
}

export function createRecommendationRepository(
  db: SqlExecutor,
): RecommendationRepository {
  return {
    async insert(input) {
      const recommendation = newRecommendationSchema.parse(input);
      const result = await db.execute(
        `INSERT INTO recommendations
          (domain_id, kind, topic, reason, features_json, score, shown_at, clicked, dwell_seconds, skipped)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, 0, 0, 0)`,
        [
          recommendation.domain,
          recommendation.kind,
          recommendation.topic,
          recommendation.reason ?? null,
          JSON.stringify(recommendation.features),
          recommendation.score,
        ],
      );

      return {
        ...recommendation,
        id: requireInsertId(result.lastInsertId, "recommendations"),
        shownAt: null,
        clicked: false,
        dwellSeconds: 0,
        skipped: false,
      };
    },

    async listByDomain(domain, limit) {
      const hasLimit = typeof limit === "number";
      const rows = await db.select<RecommendationRow[]>(
        `SELECT id, domain_id, kind, topic, reason, features_json, score, shown_at, clicked, dwell_seconds, skipped
           FROM recommendations
          WHERE domain_id = $1
          ORDER BY score DESC, id DESC${hasLimit ? " LIMIT $2" : ""}`,
        hasLimit ? [domain, limit] : [domain],
      );
      return rows.map(parseRecommendationRow);
    },

    async getByDomainKindTopic(domain, kind, topic) {
      const rows = await db.select<RecommendationRow[]>(
        `SELECT id, domain_id, kind, topic, reason, features_json, score, shown_at, clicked, dwell_seconds, skipped
           FROM recommendations
          WHERE domain_id = $1 AND kind = $2 AND topic = $3
          ORDER BY id DESC
          LIMIT 1`,
        [domain, kind, topic],
      );
      return rows[0] ? parseRecommendationRow(rows[0]) : null;
    },

    async upsertCandidate(input) {
      const recommendation = newRecommendationSchema.parse(input);
      const existing = await this.getByDomainKindTopic(
        recommendation.domain,
        recommendation.kind,
        recommendation.topic,
      );

      if (!existing?.id) {
        return this.insert(recommendation);
      }

      await db.execute(
        `UPDATE recommendations
            SET reason = $2,
                features_json = $3,
                score = $4
          WHERE id = $1`,
        [
          existing.id,
          recommendation.reason ?? null,
          JSON.stringify(recommendation.features),
          recommendation.score,
        ],
      );

      return {
        ...existing,
        ...recommendation,
        id: existing.id,
        shownAt: existing.shownAt,
        clicked: existing.clicked,
        dwellSeconds: existing.dwellSeconds,
        skipped: existing.skipped,
      };
    },

    async markShown(id, shownAt) {
      await db.execute("UPDATE recommendations SET shown_at = $2 WHERE id = $1", [
        id,
        shownAt,
      ]);
    },

    async markClicked(id, dwellSeconds) {
      await db.execute(
        `UPDATE recommendations
            SET clicked = 1,
                dwell_seconds = $2,
                skipped = 0
          WHERE id = $1`,
        [id, dwellSeconds],
      );
    },

    async markSkipped(id) {
      await db.execute(
        `UPDATE recommendations
            SET skipped = 1
          WHERE id = $1`,
        [id],
      );
    },
  };
}
