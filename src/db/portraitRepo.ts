import { portraitSchema, type Portrait } from "@/types/portrait";
import type { SqlExecutor } from "./types";

interface PortraitVersionRow {
  id: number;
  domain_id: string;
  version: number;
  portrait_json: string;
  confidence: number;
  created_at: string;
  change_summary: string | null;
}

interface MaxVersionRow {
  max_version: number | null;
}

export interface PortraitVersionRecord {
  id: number;
  domainId: string;
  version: number;
  portrait: Portrait;
  confidence: number;
  createdAt: string;
  changeSummary: string | null;
}

export interface PortraitRepository {
  save(portrait: Portrait): Promise<PortraitVersionRecord>;
  getLatest(domainId: string): Promise<PortraitVersionRecord | null>;
  getByVersion(domainId: string, version: number): Promise<PortraitVersionRecord | null>;
  listByDomain(domainId: string): Promise<PortraitVersionRecord[]>;
  nextVersion(domainId: string): Promise<number>;
}

function parsePortraitRow(row: PortraitVersionRow): PortraitVersionRecord {
  return {
    id: row.id,
    domainId: row.domain_id,
    version: row.version,
    portrait: portraitSchema.parse(JSON.parse(row.portrait_json)),
    confidence: row.confidence,
    createdAt: row.created_at,
    changeSummary: row.change_summary,
  };
}

function requireInsertId(lastInsertId: number | undefined, table: string): number {
  if (typeof lastInsertId !== "number") {
    throw new Error(`${table} insert did not return lastInsertId`);
  }
  return lastInsertId;
}

export function createPortraitRepository(db: SqlExecutor): PortraitRepository {
  return {
    async save(portrait) {
      const result = await db.execute(
        `INSERT INTO portrait_versions
          (domain_id, version, portrait_json, confidence, created_at, change_summary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          portrait.domain,
          portrait.portraitVersion,
          JSON.stringify(portrait),
          portrait.confidence,
          portrait.updatedAt,
          portrait.changeSummary ?? null,
        ],
      );

      const id = requireInsertId(result.lastInsertId, "portrait_versions");
      return {
        id,
        domainId: portrait.domain,
        version: portrait.portraitVersion,
        portrait,
        confidence: portrait.confidence,
        createdAt: portrait.updatedAt,
        changeSummary: portrait.changeSummary ?? null,
      };
    },

    async getLatest(domainId) {
      const rows = await db.select<PortraitVersionRow[]>(
        `SELECT id, domain_id, version, portrait_json, confidence, created_at, change_summary
           FROM portrait_versions
          WHERE domain_id = $1
          ORDER BY version DESC
          LIMIT 1`,
        [domainId],
      );
      return rows[0] ? parsePortraitRow(rows[0]) : null;
    },

    async getByVersion(domainId, version) {
      const rows = await db.select<PortraitVersionRow[]>(
        `SELECT id, domain_id, version, portrait_json, confidence, created_at, change_summary
           FROM portrait_versions
          WHERE domain_id = $1 AND version = $2
          LIMIT 1`,
        [domainId, version],
      );
      return rows[0] ? parsePortraitRow(rows[0]) : null;
    },

    async listByDomain(domainId) {
      const rows = await db.select<PortraitVersionRow[]>(
        `SELECT id, domain_id, version, portrait_json, confidence, created_at, change_summary
           FROM portrait_versions
          WHERE domain_id = $1
          ORDER BY version ASC`,
        [domainId],
      );
      return rows.map(parsePortraitRow);
    },

    async nextVersion(domainId) {
      const rows = await db.select<MaxVersionRow[]>(
        "SELECT MAX(version) AS max_version FROM portrait_versions WHERE domain_id = $1",
        [domainId],
      );
      return (rows[0]?.max_version ?? 0) + 1;
    },
  };
}
