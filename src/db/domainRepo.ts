import type { SqlExecutor } from "./types";

interface DomainRow {
  id: string;
  name: string;
  created_at: string;
}

export interface DomainRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface NewDomainRecord {
  id: string;
  name: string;
  createdAt: string;
}

export interface DomainRepository {
  insert(input: NewDomainRecord): Promise<DomainRecord>;
  list(): Promise<DomainRecord[]>;
  ensureDefaults(defaults: NewDomainRecord[]): Promise<DomainRecord[]>;
}

function parseDomainRow(row: DomainRow): DomainRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function createDomainRepository(db: SqlExecutor): DomainRepository {
  return {
    async insert(input) {
      await db.execute(
        `INSERT INTO domains (id, name, created_at)
         VALUES ($1, $2, $3)`,
        [input.id, input.name, input.createdAt],
      );
      return input;
    },

    async list() {
      const rows = await db.select<DomainRow[]>(
        `SELECT id, name, created_at
           FROM domains
          ORDER BY created_at ASC, name ASC`,
      );
      return rows.map(parseDomainRow);
    },

    async ensureDefaults(defaults) {
      for (const domain of defaults) {
        await db.execute(
          `INSERT OR IGNORE INTO domains (id, name, created_at)
           VALUES ($1, $2, $3)`,
          [domain.id, domain.name, domain.createdAt],
        );
      }
      return this.list();
    },
  };
}
