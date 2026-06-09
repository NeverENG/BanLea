import { evidenceSchema, type Evidence, type NewEvidence } from "@/types/evidence";
import type { SqlExecutor } from "./types";

interface EvidenceRow {
  id: number;
  domain_id: string;
  type: Evidence["type"];
  summary: string;
  payload: string;
  created_at: string;
  consumed_in_version: number | null;
}

export interface EvidenceRepository {
  insert(input: NewEvidence): Promise<Evidence>;
  listUnconsumed(domainId: string, limit?: number): Promise<Evidence[]>;
  listByDomain(domainId: string): Promise<Evidence[]>;
  markConsumed(ids: number[], portraitVersion: number): Promise<number>;
}

function parsePayload(payload: string): Record<string, unknown> {
  const parsed = JSON.parse(payload) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("evidence payload must be a JSON object");
}

function parseEvidenceRow(row: EvidenceRow): Evidence {
  return evidenceSchema.parse({
    id: row.id,
    domain: row.domain_id,
    type: row.type,
    summary: row.summary,
    payload: parsePayload(row.payload),
    createdAt: row.created_at,
    consumedInVersion: row.consumed_in_version,
  });
}

function requireInsertId(lastInsertId: number | undefined, table: string): number {
  if (typeof lastInsertId !== "number") {
    throw new Error(`${table} insert did not return lastInsertId`);
  }
  return lastInsertId;
}

export function createEvidenceRepository(db: SqlExecutor): EvidenceRepository {
  return {
    async insert(input) {
      const evidence = evidenceSchema.parse({
        ...input,
        consumedInVersion: null,
      });

      const result = await db.execute(
        `INSERT INTO evidence
          (domain_id, type, summary, payload, created_at, consumed_in_version)
         VALUES ($1, $2, $3, $4, $5, NULL)`,
        [
          evidence.domain,
          evidence.type,
          evidence.summary,
          JSON.stringify(evidence.payload),
          evidence.createdAt,
        ],
      );

      return {
        ...evidence,
        id: requireInsertId(result.lastInsertId, "evidence"),
      };
    },

    async listUnconsumed(domainId, limit) {
      const hasLimit = typeof limit === "number";
      const rows = await db.select<EvidenceRow[]>(
        `SELECT id, domain_id, type, summary, payload, created_at, consumed_in_version
           FROM evidence
          WHERE domain_id = $1 AND consumed_in_version IS NULL
          ORDER BY created_at ASC, id ASC${hasLimit ? " LIMIT $2" : ""}`,
        hasLimit ? [domainId, limit] : [domainId],
      );
      return rows.map(parseEvidenceRow);
    },

    async listByDomain(domainId) {
      const rows = await db.select<EvidenceRow[]>(
        `SELECT id, domain_id, type, summary, payload, created_at, consumed_in_version
           FROM evidence
          WHERE domain_id = $1
          ORDER BY created_at ASC, id ASC`,
        [domainId],
      );
      return rows.map(parseEvidenceRow);
    },

    async markConsumed(ids, portraitVersion) {
      if (ids.length === 0) {
        return 0;
      }

      const placeholders = ids.map((_, index) => `$${index + 2}`).join(", ");
      const result = await db.execute(
        `UPDATE evidence
            SET consumed_in_version = $1
          WHERE id IN (${placeholders})`,
        [portraitVersion, ...ids],
      );
      return result.rowsAffected;
    },
  };
}
