import { searchAction } from "../actions/SearchAction";
import { lookupAction } from "../actions/LookupAction";
import { addAction } from "../actions/AddAction";
import { providerRegistry } from "../providers/registry";
import { collectionHelper } from "../zotero/CollectionHelper";
import { pdfFetcher } from "../zotero/PdfFetcher";
import { webSearchRouter } from "../providers/web/WebSearchRouter";
import { logger } from "../infra/Logger";

export async function handleToolCall(name: string, args: any): Promise<any> {
  logger.info(`Tool call: ${name}`, JSON.stringify(args));

  switch (name) {
    case "academic_search":
      return handleAcademicSearch(args);
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

async function handleWebSearch(args: any): Promise<any> {
  const { query } = args;
  if (!query || typeof query !== "string") {
    return { error: "query is required and must be a string" };
  }

  if (!webSearchRouter.hasAnyProvider()) {
    return { error: "No web search provider is configured. Add API keys in plugin settings." };
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
    return { error: "No web search provider is configured. Add API keys in plugin settings." };
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
        error: "No web extraction provider is configured. Add API keys in plugin settings.",
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
  const all = providerRegistry.getAll();

  const academic = all
    .filter((p) => p.sourceType === "academic")
    .map((p) => ({ id: p.id, name: p.name, sourceType: p.sourceType, available: p.isAvailable() }));

  const webProviders = webSearchRouter.getHealth();

  return {
    academic: {
      totalPlatforms: academic.length,
      availableCount: academic.filter((p) => p.available).length,
      platforms: academic,
    },
    web: {
      providers: webProviders,
      anyConfigured: webSearchRouter.hasAnyProvider(),
    },
  };
}
