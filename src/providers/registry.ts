import type { SearchProvider, MetadataResolver, SourceType } from "../models/types";
import { logger } from "../infra/Logger";

class ProviderRegistry {
  private searchProviders = new Map<string, SearchProvider>();
  private resolvers = new Map<string, MetadataResolver>();

  /** Clear all search providers (used before reloading pluggable sources). */
  clearSearchProviders(): void {
    this.searchProviders.clear();
    logger.info("Search providers cleared");
  }

  registerSearchProvider(provider: SearchProvider): void {
    this.searchProviders.set(provider.id, provider);
    logger.info(
      `Search provider registered: ${provider.id} (${provider.name}) [${provider.sourceType}]`,
    );
  }

  registerResolver(resolver: MetadataResolver): void {
    this.resolvers.set(resolver.name, resolver);
    logger.info(`Resolver registered: ${resolver.name}`);
  }

  get(id: string): SearchProvider | undefined {
    return this.searchProviders.get(id);
  }

  getResolver(name: string): MetadataResolver | undefined {
    return this.resolvers.get(name);
  }

  getAvailable(): SearchProvider[] {
    return [...this.searchProviders.values()].filter((p) => p.isAvailable());
  }

  getByType(type: SourceType): SearchProvider[] {
    return [...this.searchProviders.values()].filter(
      (p) => p.sourceType === type && p.isAvailable(),
    );
  }

  getSourceTypes(): SourceType[] {
    return [...new Set([...this.searchProviders.values()].map((p) => p.sourceType))];
  }

  getAll(): SearchProvider[] {
    return [...this.searchProviders.values()];
  }

  getAllResolvers(): MetadataResolver[] {
    return [...this.resolvers.values()];
  }

  getIds(): string[] {
    return [...this.searchProviders.keys()];
  }

  getIdsByType(type: SourceType): string[] {
    return [...this.searchProviders.values()].filter((p) => p.sourceType === type).map((p) => p.id);
  }

  getAvailableIds(): string[] {
    return this.getAvailable().map((p) => p.id);
  }

  isSourceType(value: string): value is SourceType {
    return ["web", "academic", "patent"].includes(value);
  }
}

export const providerRegistry = new ProviderRegistry();
