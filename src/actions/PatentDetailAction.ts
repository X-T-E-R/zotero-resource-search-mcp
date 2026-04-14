import { providerRegistry } from "../providers/registry";
import type { PatentDetailResult } from "../models/types";

export class PatentDetailAction {
  async execute(
    platform: string,
    sourceId: string,
    options?: Record<string, unknown>,
  ): Promise<PatentDetailResult> {
    const provider = providerRegistry.get(platform);
    if (!provider) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    if (provider.sourceType !== "patent") {
      throw new Error(`Platform ${platform} is not a patent provider`);
    }
    if (!provider.isAvailable()) {
      throw new Error(`Platform ${platform} is not available`);
    }
    if (typeof provider.getDetail !== "function") {
      throw new Error(`Platform ${platform} does not support patent detail`);
    }
    return provider.getDetail(sourceId, options);
  }
}

export const patentDetailAction = new PatentDetailAction();
