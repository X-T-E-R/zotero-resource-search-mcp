export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

const TOOL_DEFINITIONS: ToolSchema[] = [
  {
    name: "mcp_help",
    description:
      "Return user-facing MCP help, including endpoint info, tool summaries, and provider-specific usage examples.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["overview", "tools", "providers", "patents", "skills"],
          description: "Optional help topic filter",
        },
        tool: {
          type: "string",
          description: "Optional tool name to focus on",
        },
        provider: {
          type: "string",
          description: "Optional provider/backend id to focus on",
        },
        locale: {
          type: "string",
          enum: ["zh", "en"],
          description: "Preferred response locale",
        },
      },
    },
  },
  {
    name: "academic_search",
    description:
      "Search academic resources (papers, articles) across multiple platforms. Returns structured results that can be added to Zotero.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        platform: {
          type: "string",
          description:
            'Platform to search. Use "all" for federated search across all available academic platforms.',
          enum: [],
        },
        maxResults: {
          type: "number",
          description: "Maximum results per platform. 0 = global default, -1 = source maximum.",
        },
        page: { type: "number", description: "Page number (default: 1)" },
        year: {
          type: "string",
          description: 'Year or year range filter (e.g., "2024" or "2020-2024")',
        },
        author: { type: "string", description: "Author name filter" },
        sortBy: {
          type: "string",
          enum: ["relevance", "date", "citations"],
          description: "Sort criteria (per-provider defaults are used if not specified)",
        },
        extra: {
          type: "object",
          description:
            'Provider-specific extra parameters. E.g. {"sortOrder": "ascending"} for arXiv, {"database": "SSCI"} for WoS.',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "patent_search",
    description:
      "Search patent resources across registered patent platforms. Returns structured patent items that can be added to Zotero.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Patent search query string" },
        platform: {
          type: "string",
          description:
            'Patent platform to search. Use "all" for federated search across all available patent platforms.',
          enum: [],
        },
        maxResults: {
          type: "number",
          description: "Maximum results per platform. 0 = global default, -1 = source maximum.",
        },
        page: { type: "number", description: "Page number (default: 1)" },
        sortBy: {
          type: "string",
          enum: ["relevance", "date"],
          description: "Patent search sort criteria",
        },
        patentType: {
          type: "string",
          enum: ["all", "invention", "utility_model", "design"],
          description: "PatentStar patent type filter",
        },
        legalStatus: {
          type: "string",
          enum: ["all", "valid", "invalid", "pending"],
          description: "PatentStar legal status filter",
        },
        database: {
          type: "string",
          enum: ["CN", "WD"],
          description: "PatentStar database: China patents or world patents",
        },
        sortField: {
          type: "string",
          enum: ["applicationDate", "publicationDate"],
          description: "PatentStar sort field override",
        },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: "PatentStar sort direction override",
        },
        queryMode: {
          type: "string",
          enum: ["simple", "expert"],
          description: "Treat query as normal keywords or provider-native expert syntax",
        },
        rawQuery: {
          type: "string",
          description:
            "Provider-native expert query string. For PatentStar this can be an F ... expert expression.",
        },
        extra: {
          type: "object",
          description: "Patent-provider-specific extra parameters.",
        },
      },
    },
  },
  {
    name: "patent_detail",
    description:
      "Fetch detailed patent data by provider-native patent id. Returns a normalized patent item plus structured detail blocks.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          description: "Patent platform id",
          enum: [],
        },
        sourceId: {
          type: "string",
          description: "Provider-native patent id, such as PatentStar ANE",
        },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["core", "legalStatus", "claims", "description", "pdf", "images"],
          },
          description: "Detail sections to include",
        },
      },
      required: ["platform", "sourceId"],
    },
  },
  {
    name: "web_search",
    description:
      'Unified web search. Auto-routes to Tavily/Firecrawl/Exa/xAI based on query intent. Supports modes like "web", "news", "social", "docs", "research", "github", "pdf".',
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        mode: {
          type: "string",
          enum: ["auto", "web", "news", "social", "docs", "research", "github", "pdf"],
          description: "Search mode (default: auto)",
        },
        intent: {
          type: "string",
          enum: [
            "auto",
            "factual",
            "status",
            "comparison",
            "tutorial",
            "exploratory",
            "news",
            "resource",
          ],
          description: "Query intent hint (default: auto)",
        },
        strategy: {
          type: "string",
          enum: ["auto", "fast", "balanced", "verify", "deep"],
          description: "Search strategy (default: auto)",
        },
        provider: {
          type: "string",
          enum: ["auto", "tavily", "firecrawl", "exa", "xai"],
          description: "Force a specific provider (default: auto)",
        },
        sources: {
          type: "array",
          items: { type: "string", enum: ["web", "x"] },
          description: 'Search sources, e.g. ["web"], ["x"], or ["web","x"]',
        },
        max_results: {
          type: "number",
          description: "Maximum results. 0 = global default, -1 = backend maximum.",
        },
        include_content: {
          type: "boolean",
          description: "Include page full text (default: false)",
        },
        include_answer: {
          type: "boolean",
          description: "Include AI-generated answer (default: true)",
        },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "Only search these domains",
        },
        exclude_domains: {
          type: "array",
          items: { type: "string" },
          description: "Exclude these domains",
        },
        from_date: { type: "string", description: "Start date filter (YYYY-MM-DD)" },
        to_date: { type: "string", description: "End date filter (YYYY-MM-DD)" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_research",
    description:
      "Multi-step research workflow: web search + top-N page scraping + optional X/social search. Returns comprehensive evidence.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Research question" },
        web_max_results: { type: "number", description: "Web search results (default: 5)" },
        social_max_results: { type: "number", description: "Social search results (default: 5)" },
        scrape_top_n: { type: "number", description: "How many top URLs to scrape (default: 3)" },
        include_social: { type: "boolean", description: "Include X/social search (default: true)" },
        mode: {
          type: "string",
          enum: ["auto", "web", "news", "social", "docs", "research", "github", "pdf"],
          description: "Search mode (default: auto)",
        },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "Only search these domains",
        },
        exclude_domains: {
          type: "array",
          items: { type: "string" },
          description: "Exclude these domains",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "resource_lookup",
    description:
      "Look up a resource by identifier (DOI, PMID, arXiv ID, ISBN) or extract content from a URL. When a URL is given, fetches and returns the page content.",
    inputSchema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description: "Academic identifier (DOI, PMID, arXiv ID, ISBN)",
        },
        identifierType: {
          type: "string",
          enum: ["doi", "pmid", "arxiv", "isbn"],
          description: "Type of identifier (auto-detected if not specified)",
        },
        url: {
          type: "string",
          description: "URL to extract content from (alternative to identifier)",
        },
        formats: {
          type: "array",
          items: { type: "string" },
          description: 'Output formats for URL extraction (default: ["markdown"])',
        },
        provider: {
          type: "string",
          enum: ["auto", "firecrawl", "tavily"],
          description: "Extraction provider (default: auto)",
        },
      },
    },
  },
  {
    name: "resource_add",
    description:
      'Add a resource to Zotero library. Supports adding to specific collections by key or path (e.g. "MyFolder/SubFolder"). Optionally fetches PDF.',
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "object", description: "ResourceItem object from search results" },
        url: { type: "string", description: "URL of a resource to add (alternative to item)" },
        collectionKey: {
          type: "string",
          description: "Zotero collection key to add the item to",
        },
        collectionPath: {
          type: "string",
          description:
            'Collection path using "/" separator (e.g. "Research/ML/Transformers"). Resolved to a collection key.',
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Additional tags to add",
        },
        fetchPDF: {
          type: "boolean",
          description: "Attempt to find and attach the PDF (default from settings)",
        },
      },
    },
  },
  {
    name: "collection_list",
    description:
      "List all Zotero collections and sub-collections. Returns a tree structure with collection keys, names, item counts and hierarchy.",
    inputSchema: {
      type: "object",
      properties: {
        flat: {
          type: "boolean",
          description:
            "If true, return a flat list with full paths instead of a tree (default: false)",
        },
      },
    },
  },
  {
    name: "resource_pdf",
    description:
      "Attempt to find and attach a PDF for an existing Zotero item. Uses Zotero's built-in PDF resolvers.",
    inputSchema: {
      type: "object",
      properties: {
        itemKey: {
          type: "string",
          description: "The Zotero item key to fetch the PDF for",
        },
      },
      required: ["itemKey"],
    },
  },
  {
    name: "platform_status",
    description:
      "Check the availability and configuration status of all platforms, grouped by source type (academic, patent, web).",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export function cloneToolSchemas(): ToolSchema[] {
  return JSON.parse(JSON.stringify(TOOL_DEFINITIONS)) as ToolSchema[];
}

export function getCanonicalToolNames(): string[] {
  return TOOL_DEFINITIONS.map((tool) => tool.name);
}
