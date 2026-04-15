import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import type { WebSearchResponse, WebExtractResponse } from "./types";
import type { WebBackend, WebBackendCapability, WebBackendConfigField } from "./WebBackend";

const FIRECRAWL_CONFIG_SCHEMA: WebBackendConfigField[] = [
  { key: "apiKey", label: "API Key", labelZh: "API 密钥", type: "password", placeholder: "fc-..." },
  { key: "baseUrl", label: "Base URL", labelZh: "基础地址", type: "text", advanced: true },
  { key: "searchPath", label: "Search path", labelZh: "搜索路径", type: "text", advanced: true },
  { key: "scrapePath", label: "Scrape path", labelZh: "抓取路径", type: "text", advanced: true },
];

export class FirecrawlClient implements WebBackend {
  readonly id = "firecrawl";
  readonly name = "Firecrawl";
  readonly description = "Web search and page scraping";
  readonly descriptionZh = "网页搜索与页面抓取";
  readonly capabilities = new Set<WebBackendCapability>(["search", "extract"]);
  readonly configSchema = FIRECRAWL_CONFIG_SCHEMA;
  private getHttp(): HttpClient {
    const baseURL = configProvider.getString("web.firecrawl.baseUrl", "https://api.firecrawl.dev");
    const apiKey = configProvider.getString("web.firecrawl.apiKey", "");
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return new HttpClient({ baseURL, timeout: 45_000, headers });
  }

  isEnabled(): boolean {
    return configProvider.getBool("web.firecrawl.enabled", true);
  }

  hasRequiredConfig(): boolean {
    return !!configProvider.getString("web.firecrawl.apiKey", "");
  }

  isConfigured(): boolean {
    return this.isEnabled() && this.hasRequiredConfig();
  }

  async search(opts: {
    query: string;
    maxResults?: number;
    categories?: string[];
    includeContent?: boolean;
  }): Promise<WebSearchResponse> {
    const http = this.getHttp();

    const payload: Record<string, any> = {
      query: opts.query,
      limit: opts.maxResults ?? 5,
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
