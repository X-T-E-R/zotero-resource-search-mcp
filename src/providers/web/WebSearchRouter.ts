import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { TavilyClient } from "./TavilyClient";
import { FirecrawlClient } from "./FirecrawlClient";
import { ExaClient } from "./ExaClient";
import { XAIClient } from "./XAIClient";
import { MySearchProxyClient } from "./MySearchProxyClient";
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
  private tavily = new TavilyClient();
  private firecrawl = new FirecrawlClient();
  private exa = new ExaClient();
  private xai = new XAIClient();
  private mySearchProxy = new MySearchProxyClient();

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
    if (proxyFirst && this.mySearchProxy.isConfigured()) {
      try {
        return await this.mySearchProxy.search(opts);
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
    if (proxyFirst && this.mySearchProxy.isConfigured()) {
      try {
        return await this.mySearchProxy.extractUrl(opts);
      } catch (e) {
        logger.warn(`MySearch Proxy extract failed, falling back: ${e}`);
      }
    }

    const provider = opts.provider ?? "auto";
    const errors: string[] = [];

    if (provider === "auto" || provider === "firecrawl") {
      if (this.firecrawl.isConfigured()) {
        try {
          const result = await this.firecrawl.scrape({
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
      if (this.tavily.isConfigured()) {
        try {
          const result = await this.tavily.extract(opts.url);
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
    if (proxyFirst && this.mySearchProxy.isConfigured()) {
      try {
        return await this.mySearchProxy.research(opts);
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
    if (includeSocial && this.xai.isConfigured()) {
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
    const providers: WebProviderHealth[] = [
      {
        name: "tavily",
        configured: this.tavily.isConfigured(),
        base_url: configProvider.getString("web.tavily.baseUrl", "https://api.tavily.com"),
        auth_mode: configProvider.getString("web.tavily.authMode", "body"),
      },
      {
        name: "firecrawl",
        configured: this.firecrawl.isConfigured(),
        base_url: configProvider.getString("web.firecrawl.baseUrl", "https://api.firecrawl.dev"),
        auth_mode: "bearer",
      },
      {
        name: "exa",
        configured: this.exa.isConfigured(),
        base_url: configProvider.getString("web.exa.baseUrl", "https://api.exa.ai"),
        auth_mode: "bearer",
      },
      {
        name: "xai",
        configured: this.xai.isConfigured(),
        base_url: configProvider.getString("web.xai.baseUrl", "https://api.x.ai/v1"),
        auth_mode: "bearer",
      },
      {
        name: "mysearch_proxy",
        configured: this.mySearchProxy.isConfigured(),
        base_url: configProvider.getString("web.mysearch.baseUrl", ""),
        auth_mode: "bearer",
      },
    ];
    return providers;
  }

  hasAnyProvider(): boolean {
    return (
      this.tavily.isConfigured() ||
      this.firecrawl.isConfigured() ||
      this.exa.isConfigured() ||
      this.xai.isConfigured() ||
      this.mySearchProxy.isConfigured()
    );
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
      if (!this.xai.isConfigured() && this.tavily.isConfigured()) {
        return {
          provider: "tavily",
          reason: "xAI not configured, fallback to Tavily",
          tavily_topic: "general",
        };
      }
      return { provider: "xai", reason: "Social / X search uses xAI", sources: ["x"] };
    }

    if (mode === "docs" || mode === "github" || mode === "pdf") {
      if (this.firecrawl.isConfigured()) {
        return {
          provider: "firecrawl",
          reason: "Docs/GitHub/PDF uses Firecrawl",
          firecrawl_categories: this.firecrawlCategories(mode, intent),
        };
      }
      if (this.exa.isConfigured())
        return { provider: "exa", reason: "Firecrawl unavailable, docs fallback to Exa" };
    }

    if (includeContent) {
      if (this.firecrawl.isConfigured()) {
        return {
          provider: "firecrawl",
          reason: "Content requested, Firecrawl preferred",
          firecrawl_categories: this.firecrawlCategories(mode, intent),
        };
      }
      if (this.exa.isConfigured())
        return { provider: "exa", reason: "Firecrawl unavailable, content fallback to Exa" };
    }

    if (intent === "news" || intent === "status" || mode === "news") {
      if (this.tavily.isConfigured())
        return { provider: "tavily", reason: "News/status uses Tavily", tavily_topic: "news" };
      if (this.exa.isConfigured())
        return { provider: "exa", reason: "Tavily unavailable, news fallback to Exa" };
    }

    if (intent === "resource") {
      if (this.firecrawl.isConfigured()) {
        return {
          provider: "firecrawl",
          reason: "Resource query uses Firecrawl",
          firecrawl_categories: this.firecrawlCategories("docs", intent),
        };
      }
      if (this.exa.isConfigured())
        return { provider: "exa", reason: "Firecrawl unavailable, resource fallback to Exa" };
    }

    if (this.tavily.isConfigured())
      return {
        provider: "tavily",
        reason: "Default web search uses Tavily",
        tavily_topic: "general",
      };
    if (this.exa.isConfigured())
      return { provider: "exa", reason: "Tavily unavailable, default fallback to Exa" };
    if (this.firecrawl.isConfigured())
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
