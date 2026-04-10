export type SearchMode =
  | "auto"
  | "web"
  | "news"
  | "social"
  | "docs"
  | "research"
  | "github"
  | "pdf";

export type SearchIntent =
  | "auto"
  | "factual"
  | "status"
  | "comparison"
  | "tutorial"
  | "exploratory"
  | "news"
  | "resource";

export type ResolvedSearchIntent = Exclude<SearchIntent, "auto">;

export type SearchStrategy = "auto" | "fast" | "balanced" | "verify" | "deep";

export type WebProviderName = "auto" | "tavily" | "firecrawl" | "exa" | "xai" | "mysearch";

export interface WebSearchResult {
  provider: string;
  source: string;
  title: string;
  url: string;
  snippet: string;
  content: string;
  score?: number;
  published_date?: string;
  author?: string;
  created_at?: string;
  matched_providers?: string[];
}

export interface WebSearchResponse {
  provider: string;
  query: string;
  answer: string;
  results: WebSearchResult[];
  citations: Array<{ title: string; url: string }>;
  intent?: string;
  strategy?: string;
  route?: { selected: string; reason: string };
  error?: string;
}

export interface WebExtractResponse {
  provider: string;
  url: string;
  content: string;
  metadata?: Record<string, any>;
  warning?: string;
  fallback?: { from: string; reason: string };
}

export interface WebResearchResponse {
  provider: string;
  query: string;
  intent: string;
  strategy: string;
  web_search: WebSearchResponse;
  pages: Array<{
    url: string;
    content?: string;
    excerpt?: string;
    metadata?: Record<string, any>;
    error?: string;
  }>;
  social_search: WebSearchResponse | null;
  social_error: string;
  citations: Array<{ title: string; url: string }>;
  evidence: {
    providers_consulted: string[];
    web_result_count: number;
    page_count: number;
    citation_count: number;
    verification: string;
  };
}

export interface RouteDecision {
  provider: string;
  reason: string;
  tavily_topic?: string;
  firecrawl_categories?: string[];
  sources?: string[];
}

export interface WebProviderHealth {
  name: string;
  configured: boolean;
  base_url: string;
  auth_mode: string;
}
