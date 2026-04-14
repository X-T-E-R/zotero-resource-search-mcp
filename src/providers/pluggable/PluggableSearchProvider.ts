import { configProvider } from "../../infra/ConfigProvider";
import type { SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import type { LoadedProviderSource, PluggableProviderImpl, ProviderManifest } from "../_sdk/types";

export interface ProviderAvailabilityCheck {
  check: () => boolean;
  reason: string;
}

export class PluggableSearchProvider implements SearchProvider {
  readonly id: string;
  readonly name: string;
  readonly sourceType: SearchProvider["sourceType"];

  constructor(
    readonly manifest: ProviderManifest,
    private readonly impl: PluggableProviderImpl,
    readonly source: LoadedProviderSource,
    private readonly extraAvailability?: ProviderAvailabilityCheck,
  ) {
    this.id = manifest.id;
    this.name = manifest.name;
    this.sourceType = manifest.sourceType;
  }

  isAvailable(): boolean {
    return this.getRuntimeStatus().available;
  }

  getRuntimeStatus(): {
    enabled: boolean;
    configured: boolean;
    available: boolean;
    reason?: string;
  } {
    const defaultOn = this.id === "scopus" ? false : true;
    const enabled = configProvider.getBool(`platform.${this.id}.enabled`, defaultOn);
    const configured = this.extraAvailability ? this.extraAvailability.check() : true;
    return {
      enabled,
      configured,
      available: enabled && configured,
      reason: enabled && !configured ? this.extraAvailability?.reason : undefined,
    };
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const ms = this.manifest.searchTimeoutMs ?? 60_000;
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Search timeout after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([this.impl.search(query, options), timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }
}
