import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://api.semanticscholar.org/graph/v1";
const FIELDS = "paperId,title,abstract,venue,year,citationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,publicationDate,journal,authors,externalIds,url";

export class SemanticScholarSearchProvider implements SearchProvider {
  readonly id = "semantic";
  readonly name = "Semantic Scholar";
  readonly sourceType = "academic" as const;

  private rateLimiter = new RateLimiter(60);

  isAvailable(): boolean {
    return configProvider.getBool("platform.semantic.enabled", true);
  }

  private getHttpClient(): HttpClient {
    const apiKey = configProvider.getString("api.semanticScholar.key");
    const headers: Record<string, string> = {};
    if (apiKey) headers["x-api-key"] = apiKey;
    return new HttpClient({ baseURL: BASE_URL, timeout: 30_000, headers });
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const startTime = Date.now();
    const maxResults = Math.min(options?.maxResults ?? 10, 100);
    const page = options?.page ?? 1;

    await this.rateLimiter.acquire();
    const http = this.getHttpClient();

    const params: Record<string, any> = {
      query,
      limit: maxResults,
      offset: (page - 1) * maxResults,
      fields: FIELDS,
    };

    if (options?.year) params.year = options.year;
    if (options?.extra?.fieldsOfStudy) params.fieldsOfStudy = options.extra.fieldsOfStudy;

    try {
      const response = await http.get<any>("/paper/search", { params });
      const data: any[] = response.data?.data ?? [];
      const total: number = response.data?.total ?? data.length;

      const items: ResourceItem[] = [];
      for (const raw of data) {
        const item = this.parseItem(raw);
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
      logger.error("Semantic Scholar search failed", error?.message);
      throw error;
    }
  }

  private parseItem(raw: any): ResourceItem | null {
    if (!raw?.title) return null;
    try {
      const authors = (raw.authors ?? []).map((a: any) => {
        const name: string = a.name ?? "";
        const parts = name.trim().split(/\s+/);
        if (parts.length <= 1) return { lastName: name.trim(), creatorType: "author" };
        const lastName = parts.pop()!;
        return { firstName: parts.join(" "), lastName, creatorType: "author" };
      });

      const doi: string = raw.externalIds?.DOI ?? "";
      const citationCount: number = raw.citationCount ?? 0;

      let date: string | undefined;
      if (raw.publicationDate) {
        date = raw.publicationDate;
      } else if (raw.year) {
        date = String(raw.year);
      }

      const extraParts: string[] = [];
      extraParts.push(`S2 ID: ${raw.paperId}`);
      if (raw.isOpenAccess) extraParts.push("Open Access: Yes");
      if (citationCount > 0) extraParts.push(`Citations: ${citationCount}`);
      if (raw.fieldsOfStudy?.length) extraParts.push(`Fields: ${raw.fieldsOfStudy.join(", ")}`);
      if (raw.openAccessPdf?.url) extraParts.push(`PDF: ${raw.openAccessPdf.url}`);

      return {
        itemType: "journalArticle",
        title: raw.title.trim(),
        creators: authors,
        abstractNote: raw.abstract?.trim() || undefined,
        date,
        DOI: doi || undefined,
        url: raw.url || `https://www.semanticscholar.org/paper/${raw.paperId}`,
        publicationTitle: raw.venue || raw.journal?.name || undefined,
        extra: extraParts.join("\n"),
        source: "semantic",
        citationCount,
      };
    } catch {
      return null;
    }
  }
}

providerRegistry.registerSearchProvider(new SemanticScholarSearchProvider());
