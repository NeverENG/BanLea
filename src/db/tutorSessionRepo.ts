import type { SqlExecutor } from "./types";

export type TutorStoredMessageRole = "user" | "assistant";

export interface TutorSessionRecord {
  id: number;
  domain: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewTutorSession {
  domain: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TutorStoredMessage {
  id: number;
  sessionId: number;
  role: TutorStoredMessageRole;
  content: string;
  createdAt: string;
}

export interface NewTutorStoredMessage {
  sessionId: number;
  role: TutorStoredMessageRole;
  content: string;
  createdAt: string;
}

interface SessionRow {
  id: number;
  domain_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: number;
  session_id: number;
  role: TutorStoredMessageRole;
  content: string;
  created_at: string;
}

export interface TutorSessionRepository {
  createSession(input: NewTutorSession): Promise<TutorSessionRecord>;
  getLatestByDomain(domain: string): Promise<TutorSessionRecord | null>;
  touchSession(id: number, updatedAt: string): Promise<void>;
  insertMessage(input: NewTutorStoredMessage): Promise<TutorStoredMessage>;
  listMessages(sessionId: number): Promise<TutorStoredMessage[]>;
}

function requireInsertId(lastInsertId: number | undefined, table: string): number {
  if (typeof lastInsertId !== "number") {
    throw new Error(`${table} insert did not return lastInsertId`);
  }
  return lastInsertId;
}

function parseSessionRow(row: SessionRow): TutorSessionRecord {
  return {
    id: row.id,
    domain: row.domain_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMessageRow(row: MessageRow): TutorStoredMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function createTutorSessionRepository(
  db: SqlExecutor,
): TutorSessionRepository {
  return {
    async createSession(input) {
      const result = await db.execute(
        `INSERT INTO sessions (domain_id, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4)`,
        [input.domain, input.title, input.createdAt, input.updatedAt],
      );
      return {
        id: requireInsertId(result.lastInsertId, "sessions"),
        ...input,
      };
    },

    async getLatestByDomain(domain) {
      const rows = await db.select<SessionRow[]>(
        `SELECT id, domain_id, title, created_at, updated_at
           FROM sessions
          WHERE domain_id = $1
          ORDER BY updated_at DESC, id DESC
          LIMIT 1`,
        [domain],
      );
      return rows[0] ? parseSessionRow(rows[0]) : null;
    },

    async touchSession(id, updatedAt) {
      await db.execute("UPDATE sessions SET updated_at = $2 WHERE id = $1", [
        id,
        updatedAt,
      ]);
    },

    async insertMessage(input) {
      const result = await db.execute(
        `INSERT INTO messages (session_id, role, content, created_at)
         VALUES ($1, $2, $3, $4)`,
        [input.sessionId, input.role, input.content, input.createdAt],
      );
      return {
        id: requireInsertId(result.lastInsertId, "messages"),
        ...input,
      };
    },

    async listMessages(sessionId) {
      const rows = await db.select<MessageRow[]>(
        `SELECT id, session_id, role, content, created_at
           FROM messages
          WHERE session_id = $1
          ORDER BY created_at ASC, id ASC`,
        [sessionId],
      );
      return rows.map(parseMessageRow);
    },
  };
}
