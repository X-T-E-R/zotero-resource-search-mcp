import type { ProviderAPI } from "../../_sdk/types";
import type { ResourceItem, SearchOptions, SearchResult } from "../../../models/types";
import { parseCrossrefItem } from "../../shared/crossrefParse";

const WORKS = "https://api.crossref.org/works";

export function createProvider(api: ProviderAPI) {
  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      const startTime = Date.now();
      const maxResults = Math.min(options?.maxResults ?? 10, 1000);
      const mailto = api.getGlobalPref("api.crossref.mailto", "paper-search-mcp@example.com");

      const params: Record<string, unknown> = {
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

      const response = await api.http.get<any>(WORKS, { params });
      const message = response.data?.message;
      const crossrefItems: any[] = message?.items ?? [];
      const total: number = message?.["total-results"] ?? crossrefItems.length;

      const items: ResourceItem[] = [];
      for (const raw of crossrefItems) {
        const item = parseCrossrefItem(raw);
        if (item) items.push(item);
      }

      return {
        platform: "crossref",
        query,
        totalResults: total,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: total > (options?.page ?? 1) * maxResults,
      };
    },
  };
}
