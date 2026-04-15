import { providerRegistry } from "./registry";
import { webBackendRegistry } from "./web/WebBackendRegistry";
import { MySearchProxyClient } from "./web/MySearchProxyClient";
import { PluggableSearchProvider } from "./pluggable/PluggableSearchProvider";
import type { ProbeSourceType, SourceScope } from "./sourcePrefs";
import { getSourceProbeQuery, markSourceVerified } from "./sourcePrefs";
import { TavilyClient } from "./web/TavilyClient";
import { FirecrawlClient } from "./web/FirecrawlClient";
import { ExaClient } from "./web/ExaClient";
import { XAIClient } from "./web/XAIClient";

export interface ProbeResult {
  ok: boolean;
  query: string;
  summary: string;
}

export async function probeSource(options: {
  scope: SourceScope;
  id: string;
  sourceType: ProbeSourceType;
  draft?: Record<string, unknown>;
}): Promise<ProbeResult> {
  const query = getSourceProbeQuery(options.scope, options.id, options.sourceType, options.draft);
  if (!query) {
    throw new Error("Missing probe query");
  }

  if (options.scope === "platform") {
    const provider = providerRegistry.get(options.id);
    if (!(provider instanceof PluggableSearchProvider)) {
      throw new Error(`Provider ${options.id} is not loaded`);
    }
    const result = await provider.search(query, { maxResults: 1, page: 1 });
    if (result.error) {
      throw new Error(result.error);
    }
    markSourceVerified("platform", options.id, query);
    return {
      ok: true,
      query,
      summary:
        result.items.length > 0
          ? `Probe succeeded with ${result.items.length} result(s)`
          : "Probe request succeeded",
    };
  }

  const target = (options.id || "").trim();
  if (!target) {
    throw new Error("Missing backend id");
  }

  const result = await probeWebBackend(target, query);
  if (result.error) {
    throw new Error(result.error);
  }
  markSourceVerified("web", options.id, query);
  return {
    ok: true,
    query,
    summary:
      result.results.length > 0
        ? `Probe succeeded with ${result.results.length} result(s)`
        : "Probe request succeeded",
  };
}

async function probeMySearchProxy(query: string) {
  const backend = webBackendRegistry.get("mysearch") as MySearchProxyClient | undefined;
  if (!backend) {
    throw new Error("MySearch Proxy backend is not loaded");
  }
  return backend.search({ query, maxResults: 1, sources: ["web"] });
}

async function probeWebBackend(id: string, query: string) {
  switch (id) {
    case "mysearch":
      return probeMySearchProxy(query);
    case "tavily": {
      const backend = webBackendRegistry.get("tavily") as TavilyClient | undefined;
      if (!backend) throw new Error("Tavily backend is not loaded");
      return backend.search({ query, maxResults: 1, includeAnswer: false, topic: "general" });
    }
    case "firecrawl": {
      const backend = webBackendRegistry.get("firecrawl") as FirecrawlClient | undefined;
      if (!backend) throw new Error("Firecrawl backend is not loaded");
      return backend.search({ query, maxResults: 1, includeContent: false });
    }
    case "exa": {
      const backend = webBackendRegistry.get("exa") as ExaClient | undefined;
      if (!backend) throw new Error("Exa backend is not loaded");
      return backend.search({ query, maxResults: 1, includeContent: false });
    }
    case "xai": {
      const backend = webBackendRegistry.get("xai") as XAIClient | undefined;
      if (!backend) throw new Error("xAI backend is not loaded");
      return backend.search({ query, maxResults: 1, sources: ["web"] });
    }
    default:
      throw new Error(`Unsupported backend: ${id}`);
  }
}
