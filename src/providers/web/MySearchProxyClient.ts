import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import type { WebSearchResponse, WebExtractResponse, WebResearchResponse } from "./types";

/**
 * Client for a running MySearch-Proxy server instance.
 * When configured, acts as a unified gateway to Tavily/Firecrawl/Exa/xAI
 * with built-in routing, caching, and key management.
 */
export class MySearchProxyClient {
  private getHttp(): HttpClient {
    const baseURL = configProvider.getString("web.mysearch.baseUrl", "");
    const apiKey = configProvider.getString("web.mysearch.apiKey", "");
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return new HttpClient({ baseURL, timeout: 60_000, headers });
  }

  isConfigured(): boolean {
    return !!configProvider.getString("web.mysearch.baseUrl", "");
  }

  async search(opts: {
    query: string;
    mode?: string;
    intent?: string;
    strategy?: string;
    provider?: string;
    sources?: string[];
    maxResults?: number;
    includeContent?: boolean;
    includeAnswer?: boolean;
    includeDomains?: string[];
    excludeDomains?: string[];
    allowedXHandles?: string[];
    excludedXHandles?: string[];
    fromDate?: string;
    toDate?: string;
  }): Promise<WebSearchResponse> {
    const http = this.getHttp();
    const mcpPath = configProvider.getString("web.mysearch.mcpPath", "/mcp");

    const args: Record<string, any> = {
      query: opts.query,
      mode: opts.mode ?? "auto",
      intent: opts.intent ?? "auto",
      strategy: opts.strategy ?? "auto",
      provider: opts.provider ?? "auto",
      max_results: opts.maxResults ?? 5,
      include_content: opts.includeContent ?? false,
      include_answer: opts.includeAnswer ?? true,
    };
    if (opts.sources?.length) args.sources = opts.sources;
    if (opts.includeDomains?.length) args.include_domains = opts.includeDomains;
    if (opts.excludeDomains?.length) args.exclude_domains = opts.excludeDomains;
    if (opts.allowedXHandles?.length) args.allowed_x_handles = opts.allowedXHandles;
    if (opts.excludedXHandles?.length) args.excluded_x_handles = opts.excludedXHandles;
    if (opts.fromDate) args.from_date = opts.fromDate;
    if (opts.toDate) args.to_date = opts.toDate;

    const rpcPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: "search", arguments: args },
    };

    const resp = await http.post<any>(mcpPath, rpcPayload);
    const result = this.extractMcpResult(resp.data);

    return {
      provider: result.provider ?? "mysearch",
      query: result.query ?? opts.query,
      answer: result.answer ?? "",
      results: (result.results ?? []).map((item: any) => ({
        provider: item.provider ?? "mysearch",
        source: item.source ?? "web",
        title: item.title ?? "",
        url: item.url ?? "",
        snippet: item.snippet ?? "",
        content: item.content ?? "",
        score: item.score,
      })),
      citations: result.citations ?? [],
      intent: result.intent,
      strategy: result.strategy,
      route: result.route,
    };
  }

  async extractUrl(opts: {
    url: string;
    formats?: string[];
    onlyMainContent?: boolean;
    provider?: string;
  }): Promise<WebExtractResponse> {
    const http = this.getHttp();
    const mcpPath = configProvider.getString("web.mysearch.mcpPath", "/mcp");

    const rpcPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "extract_url",
        arguments: {
          url: opts.url,
          formats: opts.formats ?? ["markdown"],
          only_main_content: opts.onlyMainContent ?? true,
          provider: opts.provider ?? "auto",
        },
      },
    };

    const resp = await http.post<any>(mcpPath, rpcPayload);
    const result = this.extractMcpResult(resp.data);

    return {
      provider: result.provider ?? "mysearch",
      url: result.url ?? opts.url,
      content: result.content ?? "",
      metadata: result.metadata,
    };
  }

  async research(opts: {
    query: string;
    webMaxResults?: number;
    socialMaxResults?: number;
    scrapeTopN?: number;
    includeSocial?: boolean;
    mode?: string;
    intent?: string;
    strategy?: string;
    includeDomains?: string[];
    excludeDomains?: string[];
  }): Promise<WebResearchResponse> {
    const http = this.getHttp();
    const mcpPath = configProvider.getString("web.mysearch.mcpPath", "/mcp");

    const args: Record<string, any> = {
      query: opts.query,
      web_max_results: opts.webMaxResults ?? 5,
      social_max_results: opts.socialMaxResults ?? 5,
      scrape_top_n: opts.scrapeTopN ?? 3,
      include_social: opts.includeSocial ?? true,
      mode: opts.mode ?? "auto",
      intent: opts.intent ?? "auto",
      strategy: opts.strategy ?? "auto",
    };
    if (opts.includeDomains?.length) args.include_domains = opts.includeDomains;
    if (opts.excludeDomains?.length) args.exclude_domains = opts.excludeDomains;

    const rpcPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: "research", arguments: args },
    };

    const resp = await http.post<any>(mcpPath, rpcPayload);
    return this.extractMcpResult(resp.data);
  }

  async health(): Promise<Record<string, any>> {
    const http = this.getHttp();
    const mcpPath = configProvider.getString("web.mysearch.mcpPath", "/mcp");

    const rpcPayload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: "mysearch_health", arguments: {} },
    };

    const resp = await http.post<any>(mcpPath, rpcPayload);
    return this.extractMcpResult(resp.data);
  }

  private extractMcpResult(rpcResponse: any): any {
    if (rpcResponse?.result?.content) {
      const textContent = rpcResponse.result.content.find((c: any) => c.type === "text");
      if (textContent?.text) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return { content: textContent.text };
        }
      }
    }
    if (rpcResponse?.result) return rpcResponse.result;
    if (rpcResponse?.error) throw new Error(rpcResponse.error.message ?? "MCP call failed");
    return rpcResponse;
  }
}
