import { providerRegistry } from "../providers/registry";
import { configProvider } from "../infra/ConfigProvider";
import type { SearchOptions, SearchResult } from "../models/types";
import { logger } from "../infra/Logger";
import { getAcademicSourceGuidance } from "../providers/academicSourceGuidance";
import { PluggableSearchProvider } from "../providers/pluggable/PluggableSearchProvider";
import { resolveScopedMaxResults } from "../providers/sourcePrefs";

export class SearchAction {
  async execute(
    query: string,
    platform: string = "all",
    options?: SearchOptions,
  ): Promise<SearchResult | SearchResult[]> {
    if (platform === "all") {
      return this.searchByType(query, "academic", options);
    }
    return this.searchSingle(query, platform, options);
  }

  async executeBySourceType(
    query: string,
    sourceType: "academic" | "web" | "patent",
    platform: string = "all",
    options?: SearchOptions,
  ): Promise<SearchResult | SearchResult[]> {
    if (platform === "all") {
      return this.searchByType(query, sourceType, options);
    }
    return this.searchSingle(query, platform, options);
  }

  private mergeOptions(providerId: string, options?: SearchOptions): SearchOptions {
    const globalSort = configProvider.getString(
      "general.defaultSort",
      "relevance",
    ) as SearchOptions["sortBy"];

    const providerSort = configProvider.getString(`platform.${providerId}.defaultSort`, "");
    const providerMax = configProvider.getNumber(`platform.${providerId}.maxResults`, 0);
    const provider = providerRegistry.get(providerId);
    const providerLimit =
      provider instanceof PluggableSearchProvider ? provider.manifest.maxResultsLimit : undefined;

    const effectiveSort = options?.sortBy || providerSort || undefined || globalSort || "relevance";

    return {
      ...options,
      sortBy: effectiveSort as SearchOptions["sortBy"],
      maxResults: resolveScopedMaxResults({
        requested: options?.maxResults,
        configured: providerMax,
        limit: providerLimit,
      }),
      page: options?.page ?? 1,
    };
  }

  private async searchByType(
    query: string,
    sourceType: "academic" | "web" | "patent",
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    const providers = providerRegistry.getByType(sourceType);
    if (providers.length === 0) {
      const guidance =
        sourceType === "academic"
          ? getAcademicSourceGuidance({
              locale: String((Zotero as any)?.locale || "")
                .toLowerCase()
                .startsWith("zh")
                ? "zh"
                : "en",
              academicProviderCount: 0,
              registryUrl: configProvider.getString("providers.registryUrl", ""),
            })
          : null;
      return [
        {
          platform: "all",
          query,
          totalResults: 0,
          items: [],
          page: options?.page ?? 1,
          error:
            guidance?.needsAttention && guidance.details.length
              ? `${guidance.title}: ${guidance.details.join(" ")}`
              : "No search providers available",
        },
      ];
    }

    const endTimer = logger.time(`Federated search for "${query}"`);

    const settled = await Promise.allSettled(
      providers.map((provider) => {
        const merged = this.mergeOptions(provider.id, options);
        const perProviderTimer = logger.time(`Search ${provider.id}`);
        return provider.search(query, merged).then((result) => {
          const elapsed = perProviderTimer();
          return { ...result, elapsed };
        });
      }),
    );

    const results: SearchResult[] = [];
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const provider = providers[i];
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        logger.error(`Provider ${provider.id} failed: ${outcome.reason}`);
        results.push({
          platform: provider.id,
          query,
          totalResults: 0,
          items: [],
          page: options?.page ?? 1,
          error: String(outcome.reason),
        });
      }
    }

    endTimer();
    return results;
  }

  private async searchSingle(
    query: string,
    platform: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const provider = providerRegistry.get(platform);
    if (!provider) {
      return {
        platform,
        query,
        totalResults: 0,
        items: [],
        page: options?.page ?? 1,
        error: `Unknown platform: ${platform}`,
      };
    }

    if (!provider.isAvailable()) {
      return {
        platform,
        query,
        totalResults: 0,
        items: [],
        page: options?.page ?? 1,
        error: `Platform ${platform} is not available (check configuration)`,
      };
    }

    const merged = this.mergeOptions(platform, options);
    const endTimer = logger.time(`Search ${platform} for "${query}"`);
    try {
      const result = await provider.search(query, merged);
      const elapsed = endTimer();
      return { ...result, elapsed };
    } catch (e) {
      endTimer();
      logger.error(`Search on ${platform} failed: ${e}`);
      return {
        platform,
        query,
        totalResults: 0,
        items: [],
        page: options?.page ?? 1,
        error: String(e),
      };
    }
  }
}

export const searchAction = new SearchAction();
