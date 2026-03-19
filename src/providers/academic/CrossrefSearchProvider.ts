import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://api.crossref.org/works";

export class CrossrefSearchProvider implements SearchProvider {
  readonly id = "crossref";
  readonly name = "Crossref";
  readonly sourceType = "academic" as const;

  private http = new HttpClient({ baseURL: BASE_URL, timeout: 30_000 });

  isAvailable(): boolean {
    return configProvider.getBool("platform.crossref.enabled", true);
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const maxResults = Math.min(options?.maxResults ?? 10, 1000);
    const mailto = configProvider.getString(
      "api.crossref.mailto",
      "paper-search-mcp@example.com",
    );

    const params: Record<string, any> = {
      query,
      rows: maxResults,
      offset: options?.page ? (options.page - 1) * maxResults : 0,
      mailto,
    };

    const filters: string[] = [];
    if (options?.year) {
      const yearMatch = options.year.match(/^(\d{4})(?:-(\d{4})?)?$/);
      if (yearMatch) {
        filters.push(`from-pub-date:${yearMatch[1]}`);
        if (yearMatch[2]) {
          filters.push(`until-pub-date:${yearMatch[2]}`);
        }
      }
    }
    if (filters.length > 0) {
      params.filter = filters.join(",");
    }

    const sortMapping: Record<string, string> = {
      relevance: "relevance",
      date: "published",
      citations: "is-referenced-by-count",
    };
    params.sort = sortMapping[options?.sortBy ?? "relevance"] ?? "relevance";
    params.order = "desc";

    try {
      const response = await this.http.get<any>("", { params });
      const message = response.data?.message;
      const crossrefItems: any[] = message?.items ?? [];
      const total: number = message?.["total-results"] ?? crossrefItems.length;

      const items: ResourceItem[] = [];
      for (const raw of crossrefItems) {
        const item = parseCrossrefItem(raw);
        if (item) items.push(item);
      }

      return {
        platform: this.id,
        query,
        totalResults: total,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: total > (options?.page ?? 1) * maxResults,
      };
    } catch (error: any) {
      logger.error("Crossref search failed", error?.message);
      throw error;
    }
  }
}

const CROSSREF_TYPE_MAP: Record<string, string> = {
  "journal-article": "journalArticle",
  "proceedings-article": "conferencePaper",
  "book-chapter": "bookSection",
  book: "book",
  "posted-content": "preprint",
  "report-component": "report",
  report: "report",
  dissertation: "thesis",
  dataset: "document",
  monograph: "book",
};

export function parseCrossrefItem(data: any): ResourceItem | null {
  try {
    const doi: string = data.DOI ?? "";
    const titleList: string[] = data.title ?? [];
    const title = titleList[0] ?? "No title";

    const creators: ResourceItem["creators"] = [];
    for (const author of data.author ?? []) {
      const family = author.family ?? "";
      const given = author.given ?? "";
      if (family || given) {
        creators.push({
          firstName: given || undefined,
          lastName: family || given,
          creatorType: "author",
        });
      }
    }

    let abstractNote = data.abstract ?? "";
    if (abstractNote) {
      abstractNote = abstractNote.replace(/<[^>]+>/g, "");
    }

    let date: string | undefined;
    const dateData =
      data["published-print"] ??
      data["published-online"] ??
      data["published"] ??
      data["created"];
    if (dateData?.["date-parts"]?.[0]) {
      const parts: number[] = dateData["date-parts"][0];
      if (parts[0]) {
        const y = parts[0];
        const m = String(parts[1] ?? 1).padStart(2, "0");
        const d = String(parts[2] ?? 1).padStart(2, "0");
        date = `${y}-${m}-${d}`;
      }
    }

    const itemType =
      CROSSREF_TYPE_MAP[data.type ?? ""] ?? "journalArticle";

    const citationCount: number =
      data["is-referenced-by-count"] ?? 0;

    const issn: string[] = data.ISSN ?? [];

    const extraParts: string[] = [];
    if (data.publisher) {
      extraParts.push(`Publisher: ${data.publisher}`);
    }
    if (citationCount > 0) {
      extraParts.push(`Citations: ${citationCount}`);
    }
    if (data.subject?.length) {
      extraParts.push(`Subjects: ${data.subject.join("; ")}`);
    }

    return {
      itemType,
      title,
      creators,
      abstractNote: abstractNote || undefined,
      date,
      DOI: doi || undefined,
      url: data.URL ?? (doi ? `https://doi.org/${doi}` : undefined),
      publicationTitle: data["container-title"]?.[0] ?? undefined,
      volume: data.volume ?? undefined,
      issue: data.issue ?? undefined,
      pages: data.page ?? undefined,
      ISSN: issn[0] ?? undefined,
      extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
      source: "crossref",
      citationCount,
    };
  } catch (error) {
    logger.warn("Failed to parse Crossref item", error);
    return null;
  }
}

providerRegistry.registerSearchProvider(new CrossrefSearchProvider());
