import type { WebSearchResponse, WebSearchResult } from "../providers/web/types";

export interface WorkspaceWebCommonOptions {
  maxResults?: number;
  includeContent?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface WorkspaceWebProviderOptions extends Record<string, unknown> {
  includeAnswer?: boolean;
  topic?: string;
  categories?: string[];
  sources?: string[];
  allowedXHandles?: string[];
  excludedXHandles?: string[];
  fromDate?: string;
  toDate?: string;
}

export interface WorkspaceWebAggregateRequest {
  query: string;
  providers: string[];
  commonOptions?: WorkspaceWebCommonOptions;
  providerOptions?: Record<string, WorkspaceWebProviderOptions | undefined>;
}

export interface WorkspaceWebProviderGroup {
  provider: string;
  answer: string;
  citations: Array<{ title: string; url: string }>;
  results: WebSearchResult[];
  resultCount: number;
  error?: string;
  elapsedMs: number;
  request: Record<string, unknown>;
}

export interface WorkspaceWebAggregateResult {
  query: string;
  groups: WorkspaceWebProviderGroup[];
  summary: {
    selectedProviders: string[];
    successCount: number;
    failureCount: number;
    totalResults: number;
  };
}

export async function aggregateWebSearches(
  options: WorkspaceWebAggregateRequest & {
    runProviderSearch: (
      provider: string,
      payload: Record<string, unknown>,
    ) => Promise<WebSearchResponse>;
  },
): Promise<WorkspaceWebAggregateResult> {
  const providers = [
    ...new Set((options.providers || []).filter((provider) => !!provider?.trim())),
  ];
  const commonOptions = options.commonOptions ?? {};
  const providerOptions = options.providerOptions ?? {};

  const settled = await Promise.all(
    providers.map(async (provider) => {
      const request = buildProviderRequest(
        provider,
        options.query,
        commonOptions,
        providerOptions[provider] ?? {},
      );
      const startedAt = Date.now();
      try {
        const response = await options.runProviderSearch(provider, request);
        return {
          provider,
          answer: response.answer ?? "",
          citations: response.citations ?? [],
          results: response.results ?? [],
          resultCount: (response.results ?? []).length,
          elapsedMs: Date.now() - startedAt,
          request,
        } satisfies WorkspaceWebProviderGroup;
      } catch (error) {
        return {
          provider,
          answer: "",
          citations: [],
          results: [],
          resultCount: 0,
          error: error instanceof Error ? error.toString() : String(error),
          elapsedMs: Date.now() - startedAt,
          request,
        } satisfies WorkspaceWebProviderGroup;
      }
    }),
  );

  return {
    query: options.query,
    groups: settled,
    summary: {
      selectedProviders: providers,
      successCount: settled.filter((group) => !group.error).length,
      failureCount: settled.filter((group) => !!group.error).length,
      totalResults: settled.reduce((sum, group) => sum + group.resultCount, 0),
    },
  };
}

function buildProviderRequest(
  provider: string,
  query: string,
  commonOptions: WorkspaceWebCommonOptions,
  providerOptions: WorkspaceWebProviderOptions,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    query,
    maxResults: commonOptions.maxResults,
    includeContent: commonOptions.includeContent,
    includeDomains: commonOptions.includeDomains,
    excludeDomains: commonOptions.excludeDomains,
  };

  switch (provider) {
    case "tavily":
      request.topic = providerOptions.topic ?? "general";
      request.includeAnswer = providerOptions.includeAnswer ?? true;
      break;
    case "firecrawl":
      request.categories = providerOptions.categories ?? [];
      break;
    case "xai":
      request.sources = providerOptions.sources ?? ["web"];
      request.allowedXHandles = providerOptions.allowedXHandles ?? [];
      request.excludedXHandles = providerOptions.excludedXHandles ?? [];
      request.fromDate = providerOptions.fromDate;
      request.toDate = providerOptions.toDate;
      break;
    default:
      break;
  }

  return Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined));
}
