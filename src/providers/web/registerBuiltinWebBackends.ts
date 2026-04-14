import { webBackendRegistry } from "./WebBackendRegistry";
import { TavilyClient } from "./TavilyClient";
import { FirecrawlClient } from "./FirecrawlClient";
import { ExaClient } from "./ExaClient";
import { XAIClient } from "./XAIClient";
import { MySearchProxyClient } from "./MySearchProxyClient";

export interface WebBackendRegistrationResult {
  id: string;
  name: string;
  capabilities: string[];
  registered: boolean;
  error?: string;
}

/**
 * Register built-in web backends. Called from {@link loadAllProviders} before {@link registerWebSearchProvider}.
 */
export function registerBuiltinWebBackends(): WebBackendRegistrationResult[] {
  webBackendRegistry.clear();
  const factories = [
    { id: "tavily", name: "Tavily", create: () => new TavilyClient() },
    { id: "firecrawl", name: "Firecrawl", create: () => new FirecrawlClient() },
    { id: "exa", name: "Exa", create: () => new ExaClient() },
    { id: "xai", name: "xAI", create: () => new XAIClient() },
    { id: "mysearch", name: "MySearch Proxy", create: () => new MySearchProxyClient() },
  ];

  const results: WebBackendRegistrationResult[] = [];
  for (const factory of factories) {
    try {
      const backend = factory.create();
      webBackendRegistry.register(backend);
      results.push({
        id: backend.id,
        name: backend.name,
        capabilities: [...backend.capabilities],
        registered: true,
      });
    } catch (e) {
      results.push({
        id: factory.id,
        name: factory.name,
        capabilities: [],
        registered: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
