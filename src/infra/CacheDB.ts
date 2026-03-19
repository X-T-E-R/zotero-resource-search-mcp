import { ZoteroRepository } from "./ZoteroRepository";
import { logger } from "./Logger";

interface CacheEntry {
  query_hash: string;
  data: string;
  created_at: number;
  expires_at: number;
}

class CacheRepository extends ZoteroRepository<CacheEntry> {
  constructor() {
    super("zotero-resource-search-cache", "cache_entries", {
      query_hash: { type: "TEXT", primaryKey: true },
      data: { type: "TEXT", notNull: true },
      created_at: { type: "INTEGER", notNull: true },
      expires_at: { type: "INTEGER", notNull: true },
    });
  }

  async findValidByHash(hash: string, now: number): Promise<string | null> {
    if (!this.db) return null;
    const value = await this.db.valueQueryAsync(
      "SELECT data FROM cache_entries WHERE query_hash = ? AND expires_at > ?",
      [hash, now],
    );
    return value ?? null;
  }

  async deleteExpired(now: number): Promise<void> {
    if (!this.db) return;
    await this.deleteByCondition("expires_at <= ?", [now]);
  }
}

export class CacheDB {
  private repo = new CacheRepository();

  async initialize(): Promise<void> {
    await this.repo.initialize();
  }

  async getCachedResult(queryHash: string): Promise<string | null> {
    return this.repo.findValidByHash(queryHash, Date.now());
  }

  async setCachedResult(queryHash: string, data: string, ttlMs: number = 3_600_000): Promise<void> {
    const now = Date.now();
    await this.repo.upsert({
      query_hash: queryHash,
      data,
      created_at: now,
      expires_at: now + ttlMs,
    });
  }

  async clearExpired(): Promise<void> {
    await this.repo.deleteExpired(Date.now());
  }

  async close(): Promise<void> {
    await this.repo.close();
  }
}
