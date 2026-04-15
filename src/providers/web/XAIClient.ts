import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import type { WebSearchResponse } from "./types";
import type { WebBackend, WebBackendCapability, WebBackendConfigField } from "./WebBackend";

const XAI_CONFIG_SCHEMA: WebBackendConfigField[] = [
  {
    key: "apiKey",
    label: "API Key",
    labelZh: "API 密钥",
    type: "password",
    placeholder: "xai-...",
  },
  { key: "baseUrl", label: "Base URL", labelZh: "基础地址", type: "text", advanced: true },
  {
    key: "searchMode",
    label: "Search mode",
    labelZh: "搜索模式",
    type: "select",
    advanced: true,
    options: [
      { value: "official", label: "Official (Responses API)" },
      { value: "compatible", label: "Compatible (social gateway)" },
    ],
  },
  { key: "model", label: "Model", labelZh: "模型", type: "text", advanced: true },
  {
    key: "responsesPath",
    label: "Responses path",
    labelZh: "Responses 路径",
    type: "text",
    advanced: true,
  },
  {
    key: "socialBaseUrl",
    label: "Social base URL",
    labelZh: "社交网关地址",
    type: "text",
    advanced: true,
  },
  {
    key: "socialSearchPath",
    label: "Social search path",
    labelZh: "社交搜索路径",
    type: "text",
    advanced: true,
  },
];

export class XAIClient implements WebBackend {
  readonly id = "xai";
  readonly name = "xAI";
  readonly description = "Web and X (Twitter) search via Grok";
  readonly descriptionZh = "通过 Grok 进行网页与 X 搜索";
  readonly capabilities = new Set<WebBackendCapability>(["search"]);
  readonly configSchema = XAI_CONFIG_SCHEMA;
  private getHttp(): HttpClient {
    const baseURL = configProvider.getString("web.xai.baseUrl", "https://api.x.ai/v1");
    const apiKey = configProvider.getString("web.xai.apiKey", "");
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return new HttpClient({ baseURL, timeout: 60_000, headers });
  }

  isEnabled(): boolean {
    return configProvider.getBool("web.xai.enabled", true);
  }

  hasRequiredConfig(): boolean {
    return !!configProvider.getString("web.xai.apiKey", "");
  }

  isConfigured(): boolean {
    return this.isEnabled() && this.hasRequiredConfig();
  }

  async search(opts: {
    query: string;
    sources?: string[];
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    allowedXHandles?: string[];
    excludedXHandles?: string[];
    fromDate?: string;
    toDate?: string;
  }): Promise<WebSearchResponse> {
    const searchMode = configProvider.getString("web.xai.searchMode", "official");
    if (searchMode === "compatible") {
      return this.searchCompatible(opts);
    }
    return this.searchOfficial(opts);
  }

  private async searchOfficial(opts: {
    query: string;
    sources?: string[];
    maxResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
    allowedXHandles?: string[];
    excludedXHandles?: string[];
    fromDate?: string;
    toDate?: string;
  }): Promise<WebSearchResponse> {
    const http = this.getHttp();
    const model = configProvider.getString("web.xai.model", "grok-4.20-beta-latest-non-reasoning");
    const sources = opts.sources ?? ["web"];

    const tools: any[] = [];
    if (sources.includes("web")) {
      const webTool: Record<string, any> = { type: "web_search" };
      const filters: Record<string, any> = {};
      if (opts.includeDomains?.length) filters.allowed_domains = opts.includeDomains;
      if (opts.excludeDomains?.length) filters.excluded_domains = opts.excludeDomains;
      if (Object.keys(filters).length) webTool.filters = filters;
      tools.push(webTool);
    }
    if (sources.includes("x")) {
      const xTool: Record<string, any> = { type: "x_search" };
      if (opts.allowedXHandles?.length) xTool.allowed_x_handles = opts.allowedXHandles;
      if (opts.excludedXHandles?.length) xTool.excluded_x_handles = opts.excludedXHandles;
      if (opts.fromDate) xTool.from_date = opts.fromDate;
      if (opts.toDate) xTool.to_date = opts.toDate;
      tools.push(xTool);
    }

    const payload = {
      model,
      input: [
        {
          role: "user",
          content: `${opts.query}\n\nReturn up to ${opts.maxResults ?? 5} relevant results with concise sourcing.`,
        },
      ],
      tools,
      store: false,
    };

    const responsesPath = configProvider.getString("web.xai.responsesPath", "/responses");
    const resp = await http.post<any>(responsesPath, payload);
    const data = resp.data;

    const text = this.extractOutputText(data);
    const citations = this.extractCitations(data);
    const results = citations.map((c) => ({
      provider: "xai",
      source: sources.includes("x") ? "x" : "web",
      title: c.title,
      url: c.url,
      snippet: "",
      content: "",
    }));

    return {
      provider: "xai",
      query: opts.query,
      answer: text,
      results,
      citations,
    };
  }

  private async searchCompatible(opts: {
    query: string;
    sources?: string[];
    maxResults?: number;
    allowedXHandles?: string[];
    excludedXHandles?: string[];
    fromDate?: string;
    toDate?: string;
  }): Promise<WebSearchResponse> {
    const socialBaseUrl = configProvider.getString("web.xai.socialBaseUrl", "");
    const socialPath = configProvider.getString("web.xai.socialSearchPath", "/social/search");
    const apiKey = configProvider.getString("web.xai.apiKey", "");

    const http = new HttpClient({
      baseURL: socialBaseUrl || configProvider.getString("web.xai.baseUrl", "https://api.x.ai/v1"),
      timeout: 60_000,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });

    const payload: Record<string, any> = {
      query: opts.query,
      source: "x",
      max_results: opts.maxResults ?? 5,
    };
    if (opts.allowedXHandles?.length) payload.allowed_x_handles = opts.allowedXHandles;
    if (opts.excludedXHandles?.length) payload.excluded_x_handles = opts.excludedXHandles;
    if (opts.fromDate) payload.from_date = opts.fromDate;
    if (opts.toDate) payload.to_date = opts.toDate;

    const resp = await http.post<any>(socialPath, payload);
    return this.normalizeSocialResponse(resp.data, opts.query);
  }

  private normalizeSocialResponse(response: any, query: string): WebSearchResponse {
    const rawResults =
      response?.results ?? response?.items ?? response?.posts ?? response?.data ?? [];
    const results = (Array.isArray(rawResults) ? rawResults : [])
      .filter((item: any) => typeof item === "object" && item !== null)
      .map((item: any) => ({
        provider: "xai",
        source: "x",
        title: item.title ?? item.author ?? item.handle ?? item.username ?? "",
        url: item.url ?? item.link ?? "",
        snippet: item.snippet ?? item.summary ?? item.content ?? item.full_text ?? item.text ?? "",
        content: item.content ?? item.full_text ?? item.text ?? "",
        author: item.author ?? item.username ?? item.handle ?? "",
        created_at: item.created_at ?? item.published_at ?? "",
      }));

    const citations = results
      .filter((r: any) => r.url)
      .map((r: any) => ({ title: r.title, url: r.url }));
    const answer = response?.answer ?? response?.summary ?? response?.content ?? "";

    return {
      provider: "xai",
      query: response?.query ?? query,
      answer,
      results,
      citations,
    };
  }

  private extractOutputText(payload: any): string {
    if (typeof payload?.output_text === "string") return payload.output_text;

    const parts: string[] = [];
    for (const item of payload?.output ?? []) {
      if (typeof item?.content === "string") {
        parts.push(item.content);
        continue;
      }
      if (!Array.isArray(item?.content)) continue;
      for (const part of item.content) {
        if (typeof part?.text === "string") parts.push(part.text);
        else if (typeof part?.text?.value === "string") parts.push(part.text.value);
      }
    }
    return parts.filter(Boolean).join("\n").trim();
  }

  private extractCitations(payload: any): Array<{ title: string; url: string }> {
    const raw = payload?.citations ?? [];
    const normalized: Array<{ title: string; url: string }> = [];
    const seen = new Set<string>();

    if (Array.isArray(raw)) {
      for (const item of raw) {
        const c = this.normalizeCitation(item);
        if (!c) continue;
        if (c.url && seen.has(c.url)) continue;
        if (c.url) seen.add(c.url);
        normalized.push(c);
      }
    }

    if (normalized.length) return normalized;

    for (const outputItem of payload?.output ?? []) {
      if (!Array.isArray(outputItem?.content)) continue;
      for (const contentItem of outputItem.content) {
        for (const annotation of contentItem?.annotations ?? []) {
          const c = this.normalizeCitation(annotation);
          if (!c) continue;
          if (c.url && seen.has(c.url)) continue;
          if (c.url) seen.add(c.url);
          normalized.push(c);
        }
      }
    }
    return normalized;
  }

  private normalizeCitation(item: any): { title: string; url: string } | null {
    if (!item || typeof item !== "object") return null;
    const url = item.url ?? item.target_url ?? item.link ?? item.source_url ?? "";
    const title = item.title ?? item.source_title ?? item.display_text ?? item.text ?? "";
    if (!url && !title) return null;
    return { title, url };
  }
}
