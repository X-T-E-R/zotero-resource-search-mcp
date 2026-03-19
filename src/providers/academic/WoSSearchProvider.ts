import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL_V2 = "https://api.clarivate.com/apis/wos-starter/v2";

export class WoSSearchProvider implements SearchProvider {
  readonly id = "wos";
  readonly name = "Web of Science";
  readonly sourceType = "academic" as const;

  private rateLimiter = new RateLimiter(300);

  isAvailable(): boolean {
    return configProvider.getBool("platform.wos.enabled", true) && !!configProvider.getString("api.wos.key");
  }

  private getHttpClient(): HttpClient {
    const apiKey = configProvider.getString("api.wos.key");
    return new HttpClient({
      baseURL: BASE_URL_V2,
      timeout: 30_000,
      headers: {
        "X-ApiKey": apiKey,
      },
    });
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const apiKey = configProvider.getString("api.wos.key");
    if (!apiKey) {
      throw new Error("Web of Science API key required (api.wos.key)");
    }

    const http = this.getHttpClient();
    const maxResults = Math.min(options?.maxResults ?? 25, 50);
    const page = options?.page ?? 1;

    await this.rateLimiter.acquire();

    const q = this.buildQuery(query, options);
    const sortField = this.mapSortField(options?.sortBy ?? "citations");
    const database = options?.extra?.database
      || configProvider.getString("platform.wos.database", "WOS");

    const params: Record<string, any> = {
      q,
      db: database,
      limit: maxResults,
      page,
    };
    if (sortField) {
      params.sortField = `${sortField} DESC`;
    }

    try {
      const response = await http.get<any>("/documents", { params });
      const hits: any[] = response.data.hits ?? [];
      const total: number = response.data.metadata?.total ?? 0;

      const items: ResourceItem[] = [];
      for (const hit of hits) {
        const item = this.parseRecord(hit);
        if (item) items.push(item);
      }

      return {
        platform: this.id,
        query,
        totalResults: total,
        items,
        page,
        elapsed: Date.now() - startTime,
        hasMore: total > page * maxResults,
      };
    } catch (error: any) {
      logger.error("WoS search failed", error?.message);
      throw error;
    }
  }

  private buildQuery(query: string, options?: SearchOptions): string {
    const parts: string[] = [];

    const fieldTags = ["TS=", "TI=", "AU=", "SO=", "DO=", "PY="];
    const hasTag = fieldTags.some((t) =>
      query.toUpperCase().includes(t),
    );

    if (hasTag) {
      parts.push(query);
    } else {
      parts.push(`TS=(${this.escapeQuery(query)})`);
    }

    if (options?.year) {
      if (options.year.includes("-")) {
        const [start, end] = options.year.split("-");
        parts.push(`PY=(${start.trim()}-${end.trim()})`);
      } else {
        parts.push(`PY=${options.year}`);
      }
    }
    if (options?.author) {
      parts.push(`AU=(${this.escapeQuery(options.author)})`);
    }

    return parts.join(" AND ");
  }

  private escapeQuery(value: string): string {
    return value.replace(/['"\\]/g, "");
  }

  private mapSortField(sortBy?: string): string | undefined {
    switch (sortBy) {
      case "date":
        return "PD";
      case "citations":
        return "TC";
      case "relevance":
        return "relevance";
      default:
        return undefined;
    }
  }

  private parseRecord(rec: any): ResourceItem | null {
    try {
      const title: string = rec.title ?? "Untitled";
      const doi: string = rec.identifiers?.doi ?? "";
      const year: number | undefined = rec.source?.publishYear;

      const authors: any[] = rec.names?.authors ?? [];
      const creators: ResourceItem["creators"] = authors.map(
        (a: any) => {
          const displayName: string = a.displayName ?? "";
          return this.splitAuthorName(displayName);
        },
      );

      const date = year ? `${year}` : undefined;
      const citationCount: number =
        rec.citations?.[0]?.citingArticlesCount ??
        rec.citations?.[0]?.count ??
        0;

      const extraParts: string[] = [];
      if (rec.uid) extraParts.push(`WOS UT: ${rec.uid}`);
      if (citationCount > 0) {
        extraParts.push(`Citations: ${citationCount}`);
      }

      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: rec.abstract ?? undefined,
        date,
        DOI: doi || undefined,
        url: `https://www.webofscience.com/wos/woscc/full-record/${rec.uid}`,
        publicationTitle: rec.source?.sourceTitle ?? undefined,
        extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
        source: "wos",
        citationCount,
      };
    } catch (error) {
      logger.warn("Failed to parse WoS record", error);
      return null;
    }
  }

  private splitAuthorName(displayName: string): {
    firstName?: string;
    lastName: string;
    creatorType: string;
  } {
    const commaIdx = displayName.indexOf(",");
    if (commaIdx > 0) {
      const lastName = displayName.substring(0, commaIdx).trim();
      const firstName = displayName.substring(commaIdx + 1).trim();
      return { firstName: firstName || undefined, lastName, creatorType: "author" };
    }
    const parts = displayName.trim().split(/\s+/);
    if (parts.length <= 1) {
      return { lastName: displayName.trim(), creatorType: "author" };
    }
    const lastName = parts.pop()!;
    const firstName = parts.join(" ");
    return { firstName, lastName, creatorType: "author" };
  }
}

providerRegistry.registerSearchProvider(new WoSSearchProvider());
