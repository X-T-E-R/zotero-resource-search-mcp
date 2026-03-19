import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://api.elsevier.com";

export class ScopusSearchProvider implements SearchProvider {
  readonly id = "scopus";
  readonly name = "Scopus";
  readonly sourceType = "academic" as const;

  private rateLimiter = new RateLimiter(180);

  isAvailable(): boolean {
    return configProvider.getBool("platform.scopus.enabled", false) && !!configProvider.getString("api.elsevier.key");
  }

  private getHttpClient(): HttpClient {
    const apiKey = configProvider.getString("api.elsevier.key");
    return new HttpClient({
      baseURL: BASE_URL,
      timeout: 30_000,
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const startTime = Date.now();
    const apiKey = configProvider.getString("api.elsevier.key");
    if (!apiKey) throw new Error("Elsevier API key required for Scopus");

    const http = this.getHttpClient();
    const maxResults = Math.min(options?.maxResults ?? 10, 25);
    const page = options?.page ?? 1;

    await this.rateLimiter.acquire();

    let searchQuery = `TITLE-ABS-KEY(${query})`;
    if (options?.author) searchQuery += ` AND AUTHOR(${options.author})`;
    if (options?.year) {
      if (options.year.includes("-")) {
        const [start, end] = options.year.split("-");
        searchQuery += ` AND PUBYEAR > ${parseInt(start) - 1}`;
        if (end) searchQuery += ` AND PUBYEAR < ${parseInt(end) + 1}`;
      } else {
        searchQuery += ` AND PUBYEAR = ${options.year}`;
      }
    }

    const sortMapping: Record<string, string> = {
      relevance: "relevancy",
      date: "-coverDate",
      citations: "-citedby-count",
    };

    try {
      const response = await http.get<any>("/content/search/scopus", {
        params: {
          query: searchQuery,
          count: maxResults,
          start: (page - 1) * maxResults,
          sort: sortMapping[options?.sortBy ?? "relevance"] ?? "relevancy",
        },
      });

      const entries: any[] = response.data["search-results"]?.entry ?? [];
      const total = parseInt(response.data["search-results"]?.["opensearch:totalResults"] ?? "0", 10);

      const items: ResourceItem[] = [];
      for (const entry of entries) {
        if (entry["@_fa"] === "true" || entry["error"]) continue;
        const item = this.parseEntry(entry);
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
      logger.error("Scopus search failed", error?.message);
      throw error;
    }
  }

  private parseEntry(entry: any): ResourceItem | null {
    try {
      const title: string = entry["dc:title"] ?? "Untitled";
      const doi: string = entry["prism:doi"] ?? "";
      const creator: string = entry["dc:creator"] ?? "";
      const coverDate: string = entry["prism:coverDate"] ?? "";
      const citedBy: number = parseInt(entry["citedby-count"] ?? "0", 10);

      const creators: ResourceItem["creators"] = [];
      if (creator) {
        const parts = creator.split(",").map((s: string) => s.trim());
        if (parts.length >= 2) {
          creators.push({ lastName: parts[0], firstName: parts.slice(1).join(" "), creatorType: "author" });
        } else {
          creators.push({ lastName: creator, creatorType: "author" });
        }
      }

      const extraParts: string[] = [];
      if (entry.eid) extraParts.push(`EID: ${entry.eid}`);
      if (citedBy > 0) extraParts.push(`Citations: ${citedBy}`);

      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: entry["dc:description"] || undefined,
        date: coverDate || undefined,
        DOI: doi || undefined,
        url: doi ? `https://doi.org/${doi}` : entry.link?.[0]?.["@href"] ?? undefined,
        publicationTitle: entry["prism:publicationName"] ?? undefined,
        volume: entry["prism:volume"] ?? undefined,
        issue: entry["prism:issueIdentifier"] ?? undefined,
        extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
        source: "scopus",
        citationCount: citedBy,
      };
    } catch {
      return null;
    }
  }
}

providerRegistry.registerSearchProvider(new ScopusSearchProvider());
