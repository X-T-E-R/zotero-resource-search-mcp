import type { SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { webSearchRouter } from "./WebSearchRouter";
import { providerRegistry } from "../registry";

/**
 * Unified web search provider registered in ProviderRegistry.
 * Delegates to WebSearchRouter for actual provider selection and execution.
 */
export class WebSearchProvider implements SearchProvider {
  readonly id = "web";
  readonly name = "Web Search";
  readonly sourceType = "web" as const;

  isAvailable(): boolean {
    return webSearchRouter.hasAnyProvider();
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const startTime = Date.now();
    try {
      const response = await webSearchRouter.search({
        query,
        maxResults: options?.maxResults ?? 5,
      });

      return {
        platform: `web:${response.route?.selected ?? response.provider}`,
        query,
        totalResults: response.results.length,
        items: response.results.map((r) => ({
          itemType: "webpage",
          title: r.title,
          url: r.url,
          abstractNote: r.snippet || r.content?.slice(0, 500),
          source: r.provider,
        })),
        page: 1,
        elapsed: Date.now() - startTime,
      };
    } catch (e) {
      return {
        platform: "web",
        query,
        totalResults: 0,
        items: [],
        page: 1,
        elapsed: Date.now() - startTime,
        error: String(e),
      };
    }
  }
}

export function registerWebSearchProvider(): void {
  providerRegistry.registerSearchProvider(new WebSearchProvider());
}
