import {
  newReadingListItemSchema,
  readingListItemSchema,
  type NewReadingListItem,
  type ReadingListItem,
  type ReadingListKind,
  type ReadingListStatus,
} from "@/types/readingList";
import type { SqlExecutor } from "./types";

interface ReadingListRow {
  id: number;
  domain_id: string;
  source_id: string | null;
  title: string;
  url: string | null;
  kind: ReadingListKind | null;
  status: ReadingListStatus;
  added_at: string;
  read_at: string | null;
  dwell_seconds: number;
}

export interface ReadingListRepository {
  insert(input: NewReadingListItem): Promise<ReadingListItem>;
  listByDomain(domainId: string): Promise<ReadingListItem[]>;
  updateStatus(
    id: number,
    input: {
      status: ReadingListStatus;
      readAt: string | null;
      dwellSeconds: number;
    },
  ): Promise<ReadingListItem | null>;
}

function parseReadingListRow(row: ReadingListRow): ReadingListItem {
  return readingListItemSchema.parse({
    id: row.id,
    domain: row.domain_id,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    kind: row.kind ?? "doc",
    status: row.status,
    addedAt: row.added_at,
    readAt: row.read_at,
    dwellSeconds: row.dwell_seconds,
  });
}

function requireInsertId(lastInsertId: number | undefined, table: string): number {
  if (typeof lastInsertId !== "number") {
    throw new Error(`${table} insert did not return lastInsertId`);
  }
  return lastInsertId;
}

export function createReadingListRepository(
  db: SqlExecutor,
): ReadingListRepository {
  return {
    async insert(input) {
      const item = newReadingListItemSchema.parse(input);
      const result = await db.execute(
        `INSERT INTO reading_list
          (domain_id, source_id, title, url, kind, status, added_at, read_at, dwell_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          item.domain,
          item.sourceId,
          item.title,
          item.url,
          item.kind,
          item.status,
          item.addedAt,
          item.readAt,
          item.dwellSeconds,
        ],
      );

      return {
        ...item,
        id: requireInsertId(result.lastInsertId, "reading_list"),
      };
    },

    async listByDomain(domainId) {
      const rows = await db.select<ReadingListRow[]>(
        `SELECT id, domain_id, source_id, title, url, kind, status, added_at, read_at, dwell_seconds
           FROM reading_list
          WHERE domain_id = $1
          ORDER BY added_at DESC, id DESC`,
        [domainId],
      );
      return rows.map(parseReadingListRow);
    },

    async updateStatus(id, input) {
      await db.execute(
        `UPDATE reading_list
            SET status = $2,
                read_at = $3,
                dwell_seconds = $4
          WHERE id = $1`,
        [id, input.status, input.readAt, input.dwellSeconds],
      );
      const rows = await db.select<ReadingListRow[]>(
        `SELECT id, domain_id, source_id, title, url, kind, status, added_at, read_at, dwell_seconds
           FROM reading_list
          WHERE id = $1
          LIMIT 1`,
        [id],
      );
      return rows[0] ? parseReadingListRow(rows[0]) : null;
    },
  };
}
