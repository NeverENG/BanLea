export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlExecutor {
  execute(query: string, bindValues?: unknown[]): Promise<QueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}
