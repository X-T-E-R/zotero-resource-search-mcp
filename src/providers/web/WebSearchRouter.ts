import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { webBackendRegistry } from "./WebBackendRegistry";
import type { WebBackend } from "./WebBackend";
import type { TavilyClient } from "./TavilyClient";
import type { FirecrawlClient } from "./FirecrawlClient";
import type { ExaClient } from "./ExaClient";
import type { XAIClient } from "./XAIClient";
import type { MySearchProxyClient } from "./MySearchProxyClient";
import type {
  RouteDecision,
  SearchMode,
  SearchIntent,
  ResolvedSearchIntent,
  SearchStrategy,
  WebSearchResponse,
  WebExtractResponse,
  WebResearchResponse,
  WebProviderHealth,
} from "./types";

export class WebSearchRouter {
  private getOptionalBackend<T extends WebBackend>(id: string): T | undefined {
    const backend = webBackendRegistry.get(id);
    return backend ? (backend as T) : undefined;
  }

  private isBackendConfigured(id: string): boolean {
    return this.getOptionalBackend<WebBackend>(id)?.isConfigured() ?? false;
  }

  private get tavily(): TavilyClient {
    const b = webBackendRegistry.get("tavily");
    if (!b) throw new Error("Tavily backend not registered");
    return b as TavilyClient;
  }

  private get firecrawl(): FirecrawlClient {
    const b = webBackendRegistry.get("firecrawl");
    if (!b) throw new Error("Firecrawl backend not registered");
    return b as FirecrawlClient;
  }

  private get exa(): ExaClient {
    const b = webBackendRegistry.get("exa");
    if (!b) throw new Error("Exa backend not registered");
    return b as ExaClient;
  }

  private get xai(): XAIClient {
    const b = webBackendRegistry.get("xai");
    if (!b) throw new Error("xAI backend not registered");
    return b as XAIClient;
  }

  private get mySearchProxy(): MySearchProxyClient {
    const b = webBackendRegistry.get("mysearch");
    if (!b) throw new Error("MySearch Proxy backend not registered");
    return b as MySearchProxyClient;
  }

  async search(opts: {
    query: string;
    mode?: SearchMode;
    intent?: SearchIntent;
    strategy?: SearchStrategy;
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
    const proxyFirst = configProvider.getBool("web.mysearch.proxyFirst", false);
    const mySearchProxy = this.getOptionalBackend<MySearchProxyClient>("mysearch");
    if (proxyFirst && mySearchProxy?.isConfigured()) {
      try {
        return await mySearchProxy.search(opts);
      } catch (e) {
        logger.warn(`MySearch Proxy failed, falling back to direct: ${e}`);
      }
    }

    const mode = opts.mode ?? "auto";
    const sources = opts.sources ?? ["web"];
    const intent = this.resolveIntent(opts.query, mode, opts.intent ?? "auto", sources);
    const strategy = this.resolveStrategy(
      mode,
      intent,
      opts.strategy ?? "auto",
      sources,
      opts.includeContent ?? false,
    );
    const decision = this.routeSearch(
      opts.query,
      mode,
      intent,
      opts.provider ?? "auto",
      sources,
      opts.includeContent ?? false,
    );

    logger.info(`Web search route: ${decision.provider} (${decision.reason})`);

    let result: WebSearchResponse;
    const maxResults = opts.maxResults ?? 5;

    switch (decision.provider) {
      case "tavily":
        result = await this.tavily.search({
          query: opts.query,
          maxResults,
          topic: decision.tavily_topic ?? "general",
          includeAnswer: opts.includeAnswer ?? true,
          includeContent: opts.includeContent ?? false,
          includeDomains: opts.includeDomains,
          excludeDomains: opts.excludeDomains,
        });
        break;

      case "firecrawl":
        result = await this.firecrawl.search({
          query: opts.query,
          maxResults,
          categories: decision.firecrawl_categories,
          includeContent: opts.includeContent ?? (mode === "docs" || mode === "research"),
        });
        break;

      case "exa":
        result = await this.exa.search({
          query: opts.query,
          maxResults,
          includeDomains: opts.includeDomains,
          excludeDomains: opts.excludeDomains,
          includeContent: opts.includeContent ?? false,
        });
        break;

      case "xai":
        result = await this.xai.search({
          query: opts.query,
          sources: decision.sources ?? sources,
          maxResults,
          includeDomains: opts.includeDomains,
          excludeDomains: opts.excludeDomains,
          allowedXHandles: opts.allowedXHandles,
          excludedXHandles: opts.excludedXHandles,
          fromDate: opts.fromDate,
          toDate: opts.toDate,
        });
        break;

      default:
        throw new Error(`Unsupported web search provider: ${decision.provider}`);
    }

    result.intent = intent;
    result.strategy = strategy;
    result.route = { selected: decision.provider, reason: decision.reason };
    return result;
  }

  async extractUrl(opts: {
    url: string;
    formats?: string[];
    onlyMainContent?: boolean;
    provider?: string;
  }): Promise<WebExtractResponse> {
    const proxyFirst = configProvider.getBool("web.mysearch.proxyFirst", false);
    const mySearchProxy = this.getOptionalBackend<MySearchProxyClient>("mysearch");
    if (proxyFirst && mySearchProxy?.isConfigured()) {
      try {
        return await mySearchProxy.extractUrl(opts);
      } catch (e) {
        logger.warn(`MySearch Proxy extract failed, falling back: ${e}`);
      }
    }

    const provider = opts.provider ?? "auto";
    const errors: string[] = [];

    if (provider === "auto" || provider === "firecrawl") {
      const firecrawl = this.getOptionalBackend<FirecrawlClient>("firecrawl");
      if (firecrawl?.isConfigured()) {
        try {
          const result = await firecrawl.scrape({
            url: opts.url,
            formats: opts.formats,
            onlyMainContent: opts.onlyMainContent,
          });
          if (result.content?.trim()) return result;
          errors.push("firecrawl returned empty content");
          if (provider === "firecrawl") {
            result.warning = "firecrawl scrape returned empty content";
            return result;
          }
        } catch (e) {
          errors.push(`firecrawl failed: ${e}`);
          if (provider === "firecrawl") throw e;
        }
      }
    }

    if (provider === "auto" || provider === "tavily") {
      const tavily = this.getOptionalBackend<TavilyClient>("tavily");
      if (tavily?.isConfigured()) {
        try {
          const result = await tavily.extract(opts.url);
          if (errors.length) {
            result.fallback = { from: "firecrawl", reason: errors.join(" | ") };
          }
          return result;
        } catch (e) {
          errors.push(`tavily extract failed: ${e}`);
          if (provider === "tavily") throw e;
        }
      }
    }

    throw new Error(errors.length ? errors.join(" | ") : "No extraction provider available");
  }

  async research(opts: {
    query: string;
    webMaxResults?: number;
    socialMaxResults?: number;
    scrapeTopN?: number;
    includeSocial?: boolean;
    mode?: SearchMode;
    intent?: SearchIntent;
    strategy?: SearchStrategy;
    includeDomains?: string[];
    excludeDomains?: string[];
    allowedXHandles?: string[];
    excludedXHandles?: string[];
    fromDate?: string;
    toDate?: string;
  }): Promise<WebResearchResponse> {
    const proxyFirst = configProvider.getBool("web.mysearch.proxyFirst", false);
    const mySearchProxy = this.getOptionalBackend<MySearchProxyClient>("mysearch");
    if (proxyFirst && mySearchProxy?.isConfigured()) {
      try {
        return await mySearchProxy.research(opts);
      } catch (e) {
        logger.warn(`MySearch Proxy research failed, falling back: ${e}`);
      }
    }

    const webMaxResults = opts.webMaxResults ?? 5;
    const scrapeTopN = opts.scrapeTopN ?? 3;
    const includeSocial = opts.includeSocial ?? true;

    const webSearch = await this.search({
      query: opts.query,
      mode: opts.mode,
      intent: opts.intent,
      strategy: opts.strategy,
      sources: ["web"],
      maxResults: webMaxResults,
      includeAnswer: true,
      includeDomains: opts.includeDomains,
      excludeDomains: opts.excludeDomains,
    });

    let socialSearch: WebSearchResponse | null = null;
    let socialError = "";
    if (includeSocial && this.isBackendConfigured("xai")) {
      try {
        socialSearch = await this.xai.search({
          query: opts.query,
          sources: ["x"],
          maxResults: opts.socialMaxResults ?? 5,
          allowedXHandles: opts.allowedXHandles,
          excludedXHandles: opts.excludedXHandles,
          fromDate: opts.fromDate,
          toDate: opts.toDate,
        });
      } catch (e) {
        socialError = String(e);
      }
    }

    const urls: string[] = [];
    for (const r of webSearch.results) {
      if (r.url && !urls.includes(r.url) && urls.length < scrapeTopN) {
        urls.push(r.url);
      }
    }

    const pages: WebResearchResponse["pages"] = [];
    for (const url of urls) {
      try {
        const extracted = await this.extractUrl({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        });
        const content = extracted.content ?? "";
        pages.push({
          url: extracted.url,
          content,
          excerpt: content.replace(/\s+/g, " ").trim().slice(0, 600),
          metadata: extracted.metadata,
        });
      } catch (e) {
        pages.push({ url, error: String(e) });
      }
    }

    const allCitations = [...(webSearch.citations ?? [])];
    if (socialSearch?.citations) {
      for (const c of socialSearch.citations) {
        if (!allCitations.some((e) => e.url === c.url)) allCitations.push(c);
      }
    }

    const providersConsulted = [webSearch.provider];
    if (socialSearch) providersConsulted.push(socialSearch.provider);

    return {
      provider: "hybrid",
      query: opts.query,
      intent: webSearch.intent ?? "factual",
      strategy: webSearch.strategy ?? "fast",
      web_search: webSearch,
      pages,
      social_search: socialSearch,
      social_error: socialError,
      citations: allCitations,
      evidence: {
        providers_consulted: providersConsulted,
        web_result_count: webSearch.results.length,
        page_count: pages.filter((p) => !p.error).length,
        citation_count: allCitations.length,
        verification: providersConsulted.length > 1 ? "cross-provider" : "single-provider",
      },
    };
  }

  getHealth(): WebProviderHealth[] {
    const tavily = this.getOptionalBackend<TavilyClient>("tavily");
    const firecrawl = this.getOptionalBackend<FirecrawlClient>("firecrawl");
    const exa = this.getOptionalBackend<ExaClient>("exa");
    const xai = this.getOptionalBackend<XAIClient>("xai");
    const mySearchProxy = this.getOptionalBackend<MySearchProxyClient>("mysearch");
    const providers: WebProviderHealth[] = [
      {
        name: "tavily",
        configured: tavily?.isConfigured() ?? false,
        base_url: configProvider.getString("web.tavily.baseUrl", "https://api.tavily.com"),
        auth_mode: configProvider.getString("web.tavily.authMode", "body"),
      },
      {
        name: "firecrawl",
        configured: firecrawl?.isConfigured() ?? false,
        base_url: configProvider.getString("web.firecrawl.baseUrl", "https://api.firecrawl.dev"),
        auth_mode: "bearer",
      },
      {
        name: "exa",
        configured: exa?.isConfigured() ?? false,
        base_url: configProvider.getString("web.exa.baseUrl", "https://api.exa.ai"),
        auth_mode: "bearer",
      },
      {
        name: "xai",
        configured: xai?.isConfigured() ?? false,
        base_url: configProvider.getString("web.xai.baseUrl", "https://api.x.ai/v1"),
        auth_mode: "bearer",
      },
      {
        name: "mysearch_proxy",
        configured: mySearchProxy?.isConfigured() ?? false,
        base_url: configProvider.getString("web.mysearch.baseUrl", ""),
        auth_mode: "bearer",
      },
    ];
    return providers;
  }

  hasAnyProvider(): boolean {
    return webBackendRegistry.hasAny();
  }

  private routeSearch(
    query: string,
    mode: SearchMode,
    intent: ResolvedSearchIntent,
    provider: string,
    sources: string[],
    includeContent: boolean,
  ): RouteDecision {
    if (provider !== "auto") {
      const mapping: Record<string, () => RouteDecision> = {
        tavily: () => ({
          provider: "tavily",
          reason: "Explicit Tavily",
          tavily_topic: mode === "news" ? "news" : "general",
        }),
        firecrawl: () => ({
          provider: "firecrawl",
          reason: "Explicit Firecrawl",
          firecrawl_categories: this.firecrawlCategories(mode, intent),
        }),
        exa: () => ({ provider: "exa", reason: "Explicit Exa" }),
        xai: () => ({ provider: "xai", reason: "Explicit xAI", sources }),
      };
      if (mapping[provider]) return mapping[provider]();
    }

    if (mode === "social" || sources.includes("x")) {
      if (!this.isBackendConfigured("xai") && this.isBackendConfigured("tavily")) {
        return {
          provider: "tavily",
          reason: "xAI not configured, fallback to Tavily",
          tavily_topic: "general",
        };
      }
      return { provider: "xai", reason: "Social / X search uses xAI", sources: ["x"] };
    }

    if (mode === "docs" || mode === "github" || mode === "pdf") {
      if (this.isBackendConfigured("firecrawl")) {
        return {
          provider: "firecrawl",
          reason: "Docs/GitHub/PDF uses Firecrawl",
          firecrawl_categories: this.firecrawlCategories(mode, intent),
        };
      }
      if (this.isBackendConfigured("exa"))
        return { provider: "exa", reason: "Firecrawl unavailable, docs fallback to Exa" };
    }

    if (includeContent) {
      if (this.isBackendConfigured("firecrawl")) {
        return {
          provider: "firecrawl",
          reason: "Content requested, Firecrawl preferred",
          firecrawl_categories: this.firecrawlCategories(mode, intent),
        };
      }
      if (this.isBackendConfigured("exa"))
        return { provider: "exa", reason: "Firecrawl unavailable, content fallback to Exa" };
    }

    if (intent === "news" || intent === "status" || mode === "news") {
      if (this.isBackendConfigured("tavily"))
        return { provider: "tavily", reason: "News/status uses Tavily", tavily_topic: "news" };
      if (this.isBackendConfigured("exa"))
        return { provider: "exa", reason: "Tavily unavailable, news fallback to Exa" };
    }

    if (intent === "resource") {
      if (this.isBackendConfigured("firecrawl")) {
        return {
          provider: "firecrawl",
          reason: "Resource query uses Firecrawl",
          firecrawl_categories: this.firecrawlCategories("docs", intent),
        };
      }
      if (this.isBackendConfigured("exa"))
        return { provider: "exa", reason: "Firecrawl unavailable, resource fallback to Exa" };
    }

    if (this.isBackendConfigured("tavily"))
      return {
        provider: "tavily",
        reason: "Default web search uses Tavily",
        tavily_topic: "general",
      };
    if (this.isBackendConfigured("exa"))
      return { provider: "exa", reason: "Tavily unavailable, default fallback to Exa" };
    if (this.isBackendConfigured("firecrawl"))
      return { provider: "firecrawl", reason: "Default fallback to Firecrawl" };

    throw new Error("No web search provider is configured");
  }

  private resolveIntent(
    query: string,
    mode: SearchMode,
    intent: SearchIntent,
    sources: string[],
  ): ResolvedSearchIntent {
    if (intent !== "auto") return intent as ResolvedSearchIntent;
    const q = query.toLowerCase();
    if (mode === "news") return "news";
    if (mode === "docs" || mode === "github" || mode === "pdf") return "resource";
    if (mode === "research") return "exploratory";
    if (sources.length === 1 && sources[0] === "x") return "status";

    const patterns: Array<[ResolvedSearchIntent, string[]]> = [
      [
        "news",
        ["latest", "breaking", "news", "today", "this week", "刚刚", "最新", "新闻", "动态"],
      ],
      [
        "comparison",
        [
          " vs ",
          "versus",
          "compare",
          "comparison",
          "pros and cons",
          "对比",
          "比较",
          "区别",
          "哪个好",
        ],
      ],
      ["tutorial", ["how to", "guide", "tutorial", "walkthrough", "教程", "怎么", "如何", "入门"]],
      [
        "resource",
        [
          "docs",
          "documentation",
          "api reference",
          "changelog",
          "pricing",
          "readme",
          "github",
          "文档",
          "接口",
        ],
      ],
      [
        "status",
        [
          "status",
          "incident",
          "outage",
          "release",
          "roadmap",
          "version",
          "版本",
          "发布",
          "进展",
          "现状",
        ],
      ],
      [
        "exploratory",
        ["why", "impact", "analysis", "trend", "ecosystem", "研究", "原因", "影响", "趋势", "生态"],
      ],
    ];
    for (const [resolvedIntent, keywords] of patterns) {
      if (keywords.some((kw) => q.includes(kw))) return resolvedIntent;
    }
    return "factual";
  }

  private resolveStrategy(
    mode: SearchMode,
    intent: ResolvedSearchIntent,
    strategy: SearchStrategy,
    sources: string[],
    includeContent: boolean,
  ): SearchStrategy {
    if (strategy !== "auto") return strategy;
    if (sources.includes("web") && sources.includes("x")) return "balanced";
    if (mode === "research") return "deep";
    if (intent === "comparison" || intent === "exploratory") return "verify";
    if (
      includeContent ||
      mode === "docs" ||
      mode === "github" ||
      mode === "pdf" ||
      intent === "resource" ||
      intent === "tutorial"
    )
      return "balanced";
    return "fast";
  }

  private firecrawlCategories(mode: SearchMode, intent: ResolvedSearchIntent): string[] {
    if (mode === "github") return ["github"];
    if (mode === "pdf") return ["pdf"];
    if (mode === "docs" || mode === "research" || intent === "resource" || intent === "tutorial")
      return ["research"];
    return [];
  }
}

export const webSearchRouter = new WebSearchRouter();
