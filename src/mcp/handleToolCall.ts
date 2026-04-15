import { searchAction } from "../actions/SearchAction";
import { lookupAction } from "../actions/LookupAction";
import { addAction } from "../actions/AddAction";
import { patentDetailAction } from "../actions/PatentDetailAction";
import { configProvider } from "../infra/ConfigProvider";
import { secretStore } from "../infra/SecretStore";
import { getProviderStartupReport } from "../providers/loader";
import { collectionHelper } from "../zotero/CollectionHelper";
import { pdfFetcher } from "../zotero/PdfFetcher";
import { webSearchRouter } from "../providers/web/WebSearchRouter";
import { logger } from "../infra/Logger";
import { createHelpSnapshot } from "./helpCatalog";

export async function handleToolCall(name: string, args: any): Promise<any> {
  logger.info(`Tool call: ${name}`, JSON.stringify(args));

  switch (name) {
    case "academic_search":
      return handleAcademicSearch(args);
    case "mcp_help":
      return handleMcpHelp(args);
    case "patent_search":
      return handlePatentSearch(args);
    case "patent_detail":
      return handlePatentDetail(args);
    case "web_search":
      return handleWebSearch(args);
    case "web_research":
      return handleWebResearch(args);
    case "resource_lookup":
      return handleResourceLookup(args);
    case "resource_add":
      return handleResourceAdd(args);
    case "collection_list":
      return handleCollectionList(args);
    case "resource_pdf":
      return handleResourcePdf(args);
    case "platform_status":
      return handlePlatformStatus();

    // backwards-compatible alias
    case "resource_search":
      return handleAcademicSearch(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function handleAcademicSearch(args: any): Promise<any> {
  const { query, platform, maxResults, page, year, author, sortBy, extra } = args;

  if (!query || typeof query !== "string") {
    return { error: "query is required and must be a string" };
  }

  const options: any = { maxResults, page: page ?? 1, year, author, sortBy, extra };
  const result = await searchAction.execute(query, platform ?? "all", options);

  if (Array.isArray(result)) {
    const totalItems = result.reduce((sum, r) => sum + r.items.length, 0);
    return {
      query,
      platformsSearched: result.map((r) => r.platform),
      totalItems,
      results: result.map((r) => ({
        platform: r.platform,
        totalResults: r.totalResults,
        itemCount: r.items.length,
        elapsed: r.elapsed,
        error: r.error,
        items: r.items,
      })),
    };
  }

  return {
    query,
    platform: result.platform,
    totalResults: result.totalResults,
    itemCount: result.items.length,
    elapsed: result.elapsed,
    error: result.error,
    items: result.items,
  };
}

async function handlePatentSearch(args: any): Promise<any> {
  const {
    query,
    platform,
    maxResults,
    page,
    sortBy,
    extra,
    patentType,
    legalStatus,
    database,
    sortField,
    sortOrder,
    rawQuery,
    queryMode,
  } = args;

  const effectiveQuery =
    typeof rawQuery === "string" && rawQuery.trim()
      ? rawQuery.trim()
      : typeof query === "string"
        ? query
        : "";

  if (!effectiveQuery) {
    return { error: "query or rawQuery is required and must be a string" };
  }

  const mergedExtra = {
    ...(extra && typeof extra === "object" ? extra : {}),
    patentType,
    legalStatus,
    database,
    sortField,
    sortOrder,
    rawQuery:
      typeof rawQuery === "string" && rawQuery.trim()
        ? rawQuery
        : queryMode === "expert"
          ? effectiveQuery
          : undefined,
  };
  const options: any = { maxResults, page: page ?? 1, sortBy, extra: mergedExtra };
  const result = await searchAction.executeBySourceType(
    effectiveQuery,
    "patent",
    platform ?? "all",
    options,
  );

  if (Array.isArray(result)) {
    const totalItems = result.reduce((sum, r) => sum + r.items.length, 0);
    return {
      query: effectiveQuery,
      platformsSearched: result.map((r) => r.platform),
      totalItems,
      results: result.map((r) => ({
        platform: r.platform,
        totalResults: r.totalResults,
        itemCount: r.items.length,
        elapsed: r.elapsed,
        error: r.error,
        items: r.items,
      })),
    };
  }

  return {
    query: effectiveQuery,
    platform: result.platform,
    totalResults: result.totalResults,
    itemCount: result.items.length,
    elapsed: result.elapsed,
    error: result.error,
    items: result.items,
  };
}

async function handleMcpHelp(args: any): Promise<any> {
  return createHelpSnapshot({
    topic: args?.topic,
    tool: args?.tool,
    provider: args?.provider,
    locale: args?.locale,
  });
}

async function handlePatentDetail(args: any): Promise<any> {
  const { platform, sourceId, include } = args;

  if (!platform || typeof platform !== "string") {
    return { error: "platform is required and must be a string" };
  }
  if (!sourceId || typeof sourceId !== "string") {
    return { error: "sourceId is required and must be a string" };
  }

  try {
    return await patentDetailAction.execute(platform, sourceId, { include });
  } catch (e) {
    return { error: String(e) };
  }
}

async function handleWebSearch(args: any): Promise<any> {
  const { query } = args;
  if (!query || typeof query !== "string") {
    return { error: "query is required and must be a string" };
  }

  if (!webSearchRouter.hasAnyProvider()) {
    return {
      error: "No web search provider is configured. Configure a web backend in plugin settings.",
    };
  }

  try {
    return await webSearchRouter.search({
      query,
      mode: args.mode,
      intent: args.intent,
      strategy: args.strategy,
      provider: args.provider,
      sources: args.sources,
      maxResults: args.max_results,
      includeContent: args.include_content,
      includeAnswer: args.include_answer,
      includeDomains: args.include_domains,
      excludeDomains: args.exclude_domains,
      fromDate: args.from_date,
      toDate: args.to_date,
    });
  } catch (e) {
    return { error: String(e) };
  }
}

async function handleWebResearch(args: any): Promise<any> {
  const { query } = args;
  if (!query || typeof query !== "string") {
    return { error: "query is required and must be a string" };
  }

  if (!webSearchRouter.hasAnyProvider()) {
    return {
      error: "No web search provider is configured. Configure a web backend in plugin settings.",
    };
  }

  try {
    return await webSearchRouter.research({
      query,
      webMaxResults: args.web_max_results,
      socialMaxResults: args.social_max_results,
      scrapeTopN: args.scrape_top_n,
      includeSocial: args.include_social,
      mode: args.mode,
      intent: args.intent,
      strategy: args.strategy,
      includeDomains: args.include_domains,
      excludeDomains: args.exclude_domains,
      allowedXHandles: args.allowed_x_handles,
      excludedXHandles: args.excluded_x_handles,
      fromDate: args.from_date,
      toDate: args.to_date,
    });
  } catch (e) {
    return { error: String(e) };
  }
}

async function handleResourceLookup(args: any): Promise<any> {
  const { identifier, identifierType, url, formats, provider } = args;

  if (url && typeof url === "string") {
    if (!webSearchRouter.hasAnyProvider()) {
      return {
        error:
          "No web extraction provider is configured. Configure a web backend in plugin settings.",
      };
    }
    try {
      const extracted = await webSearchRouter.extractUrl({
        url,
        formats,
        onlyMainContent: true,
        provider,
      });
      return { found: true, type: "url_extract", ...extracted };
    } catch (e) {
      return { found: false, url, error: String(e) };
    }
  }

  if (!identifier || typeof identifier !== "string") {
    return { error: "identifier or url is required" };
  }

  const result = await lookupAction.execute(identifier, identifierType);
  if (!result) {
    return { found: false, identifier, message: "No resource found for this identifier" };
  }
  return { found: true, type: "metadata", identifier, item: result };
}

async function handleResourceAdd(args: any): Promise<any> {
  const { item, url, collectionKey, collectionPath, tags, fetchPDF } = args;

  if (!item && !url) {
    return { error: "Either item or url must be provided" };
  }

  return addAction.execute({ item, url, collectionKey, collectionPath, tags, fetchPDF });
}

async function handleCollectionList(args: any): Promise<any> {
  const flat = args?.flat === true;

  if (flat) {
    const list = collectionHelper.listFlat();
    return { format: "flat", count: list.length, collections: list };
  }

  const tree = collectionHelper.listTree();
  const countAll = (nodes: any[]): number =>
    nodes.reduce((s, n) => s + 1 + countAll(n.children), 0);
  return { format: "tree", count: countAll(tree), collections: tree };
}

async function handleResourcePdf(args: any): Promise<any> {
  const { itemKey } = args;
  if (!itemKey || typeof itemKey !== "string") {
    return { error: "itemKey is required and must be a string" };
  }
  return pdfFetcher.fetchForItem(itemKey);
}

async function handlePlatformStatus(): Promise<any> {
  const report = getProviderStartupReport();
  const academic = report.academic.map((entry) => ({
    id: entry.id,
    name: entry.name,
    sourceType: entry.sourceType,
    kind: entry.kind,
    version: entry.version,
    source: entry.source,
    registered: entry.registered,
    enabled: entry.enabled,
    configured: entry.configured,
    available: entry.available,
    error: entry.error,
  }));
  const patent = report.patent.map((entry) => ({
    id: entry.id,
    name: entry.name,
    sourceType: entry.sourceType,
    kind: entry.kind,
    version: entry.version,
    source: entry.source,
    registered: entry.registered,
    enabled: entry.enabled,
    configured: entry.configured,
    available: entry.available,
    error: entry.error,
  }));

  const webProviders = report.web.map((entry) => ({
    name: entry.id === "mysearch" ? "mysearch_proxy" : entry.id,
    displayName: entry.name,
    registered: entry.registered,
    enabled: entry.enabled,
    configured: entry.configured,
    available: entry.available,
    error: entry.error,
    capabilities: entry.capabilities ?? [],
    base_url:
      entry.id === "mysearch"
        ? configProvider.getString("web.mysearch.baseUrl", "")
        : configProvider.getString(`web.${entry.id}.baseUrl`, ""),
    auth_mode:
      entry.id === "tavily" ? configProvider.getString("web.tavily.authMode", "body") : "bearer",
  }));

  return {
    issues: report.issues,
    secretStorage: secretStore.describe(),
    academic: {
      totalPlatforms: academic.length,
      registeredCount: academic.filter((p) => p.registered).length,
      availableCount: academic.filter((p) => p.available).length,
      platforms: academic,
    },
    patent: {
      totalPlatforms: patent.length,
      registeredCount: patent.filter((p) => p.registered).length,
      availableCount: patent.filter((p) => p.available).length,
      platforms: patent,
    },
    web: {
      totalProviders: webProviders.length,
      registeredCount: webProviders.filter((p) => p.registered).length,
      configuredCount: webProviders.filter((p) => p.configured).length,
      providers: webProviders,
      anyConfigured: webProviders.some((p) => p.configured),
    },
  };
}
