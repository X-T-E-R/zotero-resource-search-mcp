import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import type { WebSearchResponse, WebExtractResponse } from "./types";
import type { WebBackend, WebBackendCapability, WebBackendConfigField } from "./WebBackend";

const TAVILY_CONFIG_SCHEMA: WebBackendConfigField[] = [
  {
    key: "apiKey",
    label: "API Key",
    labelZh: "API 密钥",
    type: "password",
    placeholder: "tvly-...",
  },
  {
    key: "baseUrl",
    label: "Base URL",
    labelZh: "基础地址",
    type: "text",
    advanced: true,
  },
  {
    key: "authMode",
    label: "Auth mode",
    labelZh: "认证方式",
    type: "select",
    advanced: true,
    options: [
      { value: "body", label: "Body (api_key)" },
      { value: "bearer", label: "Bearer" },
    ],
  },
  { key: "searchPath", label: "Search path", labelZh: "搜索路径", type: "text", advanced: true },
  { key: "extractPath", label: "Extract path", labelZh: "提取路径", type: "text", advanced: true },
];

export class TavilyClient implements WebBackend {
  readonly id = "tavily";
  readonly name = "Tavily";
  readonly description = "AI web search and page extraction";
  readonly descriptionZh = "AI 网页搜索与页面提取";
  readonly capabilities = new Set<WebBackendCapability>(["search", "extract"]);
  readonly configSchema = TAVILY_CONFIG_SCHEMA;
  private getHttp(): HttpClient {
    const baseURL = configProvider.getString("web.tavily.baseUrl", "https://api.tavily.com");
    const apiKey = configProvider.getString("web.tavily.apiKey", "");
    const authMode = configProvider.getString("web.tavily.authMode", "body");

    const headers: Record<string, string> = {};
    if (authMode === "bearer" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return new HttpClient({ baseURL, timeout: 45_000, headers });
  }

  isEnabled(): boolean {
    return configProvider.getBool("web.tavily.enabled", true);
  }

  hasRequiredConfig(): boolean {
    return !!configProvider.getString("web.tavily.apiKey", "");
  }

  isConfigured(): boolean {
    return this.isEnabled() && this.hasRequiredConfig();
  }

  async search(opts: {
    query: string;
    maxResults?: number;
    topic?: string;
    includeAnswer?: boolean;
    includeContent?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
  }): Promise<WebSearchResponse> {
    const http = this.getHttp();
    const apiKey = configProvider.getString("web.tavily.apiKey", "");
    const authMode = configProvider.getString("web.tavily.authMode", "body");

    const payload: Record<string, any> = {
      query: opts.query,
      max_results: opts.maxResults ?? 5,
      search_depth: opts.includeContent ? "advanced" : "basic",
      topic: opts.topic || "general",
      include_answer: opts.includeAnswer ?? true,
      include_raw_content: opts.includeContent ?? false,
    };
    if (authMode === "body") {
      payload.api_key = apiKey;
    }
    if (opts.includeDomains?.length) {
      payload.include_domains = opts.includeDomains;
    }
    if (opts.excludeDomains?.length) {
      payload.exclude_domains = opts.excludeDomains;
    }

    const searchPath = configProvider.getString("web.tavily.searchPath", "/search");
    const resp = await http.post<any>(searchPath, payload);
    const data = resp.data;

    return {
      provider: "tavily",
      query: data.query ?? opts.query,
      answer: data.answer ?? "",
      results: (data.results ?? []).map((item: any) => ({
        provider: "tavily",
        source: "web",
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.content ?? "",
        content: opts.includeContent ? (item.raw_content ?? "") : "",
        score: item.score,
      })),
      citations: (data.results ?? [])
        .filter((item: any) => item.url)
        .map((item: any) => ({ title: item.title ?? "", url: item.url })),
    };
  }

  async extract(url: string): Promise<WebExtractResponse> {
    const http = this.getHttp();
    const apiKey = configProvider.getString("web.tavily.apiKey", "");
    const authMode = configProvider.getString("web.tavily.authMode", "body");

    const payload: Record<string, any> = { urls: [url] };
    if (authMode === "body") {
      payload.api_key = apiKey;
    }

    const extractPath = configProvider.getString("web.tavily.extractPath", "/extract");
    const resp = await http.post<any>(extractPath, payload);
    const data = resp.data;
    const results = data.results ?? [];
    const first = results[0] ?? {};

    return {
      provider: "tavily",
      url: first.url ?? url,
      content: first.raw_content ?? first.content ?? "",
      metadata: {
        request_id: data.request_id ?? "",
        response_time: data.response_time,
        failed_results: data.failed_results ?? [],
      },
    };
  }
}
