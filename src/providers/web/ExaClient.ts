import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import type { WebSearchResponse } from "./types";

export class ExaClient {
  private getHttp(): HttpClient {
    const baseURL = configProvider.getString("web.exa.baseUrl", "https://api.exa.ai");
    const apiKey = configProvider.getString("web.exa.apiKey", "");
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }
    return new HttpClient({ baseURL, timeout: 45_000, headers });
  }

  isConfigured(): boolean {
    return !!configProvider.getString("web.exa.apiKey", "");
  }

  async search(opts: {
    query: string;
    maxResults: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    includeContent?: boolean;
  }): Promise<WebSearchResponse> {
    const http = this.getHttp();

    const payload: Record<string, any> = {
      query: opts.query,
      numResults: opts.maxResults,
    };
    if (opts.includeContent) {
      payload.text = true;
    }
    if (opts.includeDomains?.length) {
      payload.includeDomains = opts.includeDomains;
    }
    if (opts.excludeDomains?.length) {
      payload.excludeDomains = opts.excludeDomains;
    }

    const searchPath = configProvider.getString("web.exa.searchPath", "/search");
    const resp = await http.post<any>(searchPath, payload);
    const rawResults = resp.data?.results ?? resp.data?.data ?? [];

    const results = rawResults
      .filter((item: any) => typeof item === "object" && item !== null)
      .map((item: any) => ({
        provider: "exa",
        source: "web",
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.snippet ?? item.text ?? item.summary ?? item.highlight ?? "",
        content: opts.includeContent ? (item.text ?? "") : "",
        score: item.score,
        published_date: item.publishedDate ?? item.published_date ?? "",
      }));

    return {
      provider: "exa",
      query: opts.query,
      answer: resp.data?.answer ?? "",
      results,
      citations: results.filter((r: any) => r.url).map((r: any) => ({ title: r.title, url: r.url })),
    };
  }
}
