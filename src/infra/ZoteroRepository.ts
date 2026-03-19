import { logger } from "./Logger";

export interface ColumnDef {
  type: "TEXT" | "INTEGER" | "REAL" | "BLOB";
  primaryKey?: boolean;
  notNull?: boolean;
}

export class ZoteroRepository<T extends Record<string, any>> {
  protected db: any = null;

  constructor(
    private dbName: string,
    private tableName: string,
    private schema: Record<string, ColumnDef>,
  ) {}

  async initialize(): Promise<void> {
    this.db = new Zotero.DBConnection(this.dbName);
    const columns = Object.entries(this.schema)
      .map(([name, def]) => {
        let col = `${name} ${def.type}`;
        if (def.primaryKey) col += " PRIMARY KEY";
        if (def.notNull) col += " NOT NULL";
        return col;
      })
      .join(", ");
    await this.db.queryAsync(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (${columns})`,
    );
    logger.info(`Repository initialized: ${this.tableName}`);
  }

  async findOne(where: Partial<T>): Promise<T | null> {
    const { clause, values } = this.buildWhere(where);
    const row = await this.db.rowQueryAsync(
      `SELECT * FROM ${this.tableName} WHERE ${clause} LIMIT 1`,
      values,
    );
    return row ?? null;
  }

  async findMany(where?: Partial<T>, limit?: number): Promise<T[]> {
    if (!where || Object.keys(where).length === 0) {
      const sql = limit
        ? `SELECT * FROM ${this.tableName} LIMIT ${limit}`
        : `SELECT * FROM ${this.tableName}`;
      return this.db.queryAsync(sql);
    }
    const { clause, values } = this.buildWhere(where);
    const sql = limit
      ? `SELECT * FROM ${this.tableName} WHERE ${clause} LIMIT ${limit}`
      : `SELECT * FROM ${this.tableName} WHERE ${clause}`;
    return this.db.queryAsync(sql, values);
  }

  async upsert(data: T): Promise<void> {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => "?").join(", ");
    const values = keys.map((k) => data[k]);
    await this.db.queryAsync(
      `INSERT OR REPLACE INTO ${this.tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
      values,
    );
  }

  async deleteWhere(where: Partial<T>): Promise<void> {
    const { clause, values } = this.buildWhere(where);
    await this.db.queryAsync(
      `DELETE FROM ${this.tableName} WHERE ${clause}`,
      values,
    );
  }

  async deleteByCondition(condition: string, values: any[]): Promise<void> {
    await this.db.queryAsync(
      `DELETE FROM ${this.tableName} WHERE ${condition}`,
      values,
    );
  }

  async getValue(column: string, where: Partial<T>): Promise<any> {
    const { clause, values } = this.buildWhere(where);
    return this.db.valueQueryAsync(
      `SELECT ${column} FROM ${this.tableName} WHERE ${clause}`,
      values,
    );
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeDatabase();
      this.db = null;
      logger.info(`Repository closed: ${this.tableName}`);
    }
  }

  private buildWhere(where: Partial<T>): { clause: string; values: any[] } {
    const entries = Object.entries(where);
    const clause = entries.map(([k]) => `${k} = ?`).join(" AND ");
    const values = entries.map(([, v]) => v);
    return { clause, values };
  }
}
