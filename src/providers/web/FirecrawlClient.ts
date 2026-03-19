import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import type { WebSearchResponse, WebExtractResponse } from "./types";

export class FirecrawlClient {
  private getHttp(): HttpClient {
    const baseURL = configProvider.getString("web.firecrawl.baseUrl", "https://api.firecrawl.dev");
    const apiKey = configProvider.getString("web.firecrawl.apiKey", "");
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return new HttpClient({ baseURL, timeout: 45_000, headers });
  }

  isConfigured(): boolean {
    return !!configProvider.getString("web.firecrawl.apiKey", "");
  }

  async search(opts: {
    query: string;
    maxResults: number;
    categories?: string[];
    includeContent?: boolean;
  }): Promise<WebSearchResponse> {
    const http = this.getHttp();

    const payload: Record<string, any> = {
      query: opts.query,
      limit: opts.maxResults,
    };
    if (opts.categories?.length) {
      payload.categories = opts.categories.map((c) => ({ type: c }));
    }
    if (opts.includeContent) {
      payload.scrapeOptions = { formats: ["markdown"], onlyMainContent: true };
    }

    const searchPath = configProvider.getString("web.firecrawl.searchPath", "/v2/search");
    const resp = await http.post<any>(searchPath, payload);
    const data = resp.data?.data ?? {};

    const results: any[] = [];
    for (const sourceName of ["web", "news"]) {
      for (const item of data[sourceName] ?? []) {
        results.push({
          provider: "firecrawl",
          source: sourceName,
          title: item.title ?? "",
          url: item.url ?? "",
          snippet: item.description ?? item.markdown ?? "",
          content: opts.includeContent ? (item.markdown ?? "") : "",
        });
      }
    }

    return {
      provider: "firecrawl",
      query: opts.query,
      answer: "",
      results,
      citations: results.filter((r) => r.url).map((r) => ({ title: r.title, url: r.url })),
    };
  }

  async scrape(opts: {
    url: string;
    formats?: string[];
    onlyMainContent?: boolean;
  }): Promise<WebExtractResponse> {
    const http = this.getHttp();

    const payload = {
      url: opts.url,
      formats: opts.formats ?? ["markdown"],
      onlyMainContent: opts.onlyMainContent ?? true,
    };

    const scrapePath = configProvider.getString("web.firecrawl.scrapePath", "/v2/scrape");
    const resp = await http.post<any>(scrapePath, payload);
    const data = resp.data?.data ?? {};
    let content = data.markdown ?? "";
    if (!content && data.json) {
      content = JSON.stringify(data.json, null, 2);
    }

    return {
      provider: "firecrawl",
      url: data.metadata?.sourceURL ?? data.metadata?.url ?? opts.url,
      content,
      metadata: data.metadata ?? {},
    };
  }
}
