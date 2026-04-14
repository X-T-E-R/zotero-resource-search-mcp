// ── Pluggable providers ──
pref("providers.registryUrl", "");

// ── MCP Server ──
pref("mcp.server.enabled", true);
pref("mcp.server.port", 23121);

// ── General ──
pref("general.fetchPDF", false);
pref("general.defaultSort", "relevance");
pref("general.maxResults", 25);
pref("general.logLevel", "info");

// ── API Keys (shared) ──
pref("api.wos.key", "");
pref("api.pubmed.key", "");
pref("api.crossref.mailto", "");
pref("api.semanticScholar.key", "");
pref("api.elsevier.key", "");

// ── Academic Platform: arXiv ──
pref("platform.arxiv.enabled", true);
pref("platform.arxiv.defaultSort", "");
pref("platform.arxiv.maxResults", 0);
pref("platform.arxiv.sortOrder", "descending");

// ── Academic Platform: Crossref ──
pref("platform.crossref.enabled", true);
pref("platform.crossref.defaultSort", "");
pref("platform.crossref.maxResults", 0);

// ── Academic Platform: PubMed ──
pref("platform.pubmed.enabled", true);
pref("platform.pubmed.defaultSort", "");
pref("platform.pubmed.maxResults", 0);

// ── Academic Platform: Web of Science ──
pref("platform.wos.enabled", true);
pref("platform.wos.defaultSort", "citations");
pref("platform.wos.maxResults", 0);
pref("platform.wos.database", "WOS");

// ── Academic Platform: ZJU Summon ──
pref("platform.zjusummon.enabled", true);
pref("platform.zjusummon.defaultSort", "");
pref("platform.zjusummon.maxResults", 0);

// ── Academic Platform: CQVIP ──
pref("platform.cqvip.enabled", true);
pref("platform.cqvip.defaultSort", "");
pref("platform.cqvip.maxResults", 0);

// ── Academic Platform: Semantic Scholar ──
pref("platform.semantic.enabled", true);
pref("platform.semantic.defaultSort", "");
pref("platform.semantic.maxResults", 0);

// ── Academic Platform: Scopus ──
pref("platform.scopus.enabled", false);
pref("platform.scopus.defaultSort", "");
pref("platform.scopus.maxResults", 0);

// ── Academic Platform: bioRxiv ──
pref("platform.biorxiv.enabled", true);
pref("platform.biorxiv.defaultSort", "");
pref("platform.biorxiv.maxResults", 0);

// ── Academic Platform: medRxiv ──
pref("platform.medrxiv.enabled", true);
pref("platform.medrxiv.defaultSort", "");
pref("platform.medrxiv.maxResults", 0);

// ── Web Search: MySearch Proxy ──
pref("web.mysearch.enabled", true);
pref("web.mysearch.baseUrl", "");
pref("web.mysearch.apiKey", "");
pref("web.mysearch.mcpPath", "/mcp");
pref("web.mysearch.proxyFirst", false);

// ── Web Search: Tavily ──
pref("web.tavily.enabled", true);
pref("web.tavily.apiKey", "");
pref("web.tavily.baseUrl", "https://api.tavily.com");
pref("web.tavily.authMode", "body");
pref("web.tavily.searchPath", "/search");
pref("web.tavily.extractPath", "/extract");

// ── Web Search: Firecrawl ──
pref("web.firecrawl.enabled", true);
pref("web.firecrawl.apiKey", "");
pref("web.firecrawl.baseUrl", "https://api.firecrawl.dev");
pref("web.firecrawl.searchPath", "/v2/search");
pref("web.firecrawl.scrapePath", "/v2/scrape");

// ── Web Search: Exa ──
pref("web.exa.enabled", true);
pref("web.exa.apiKey", "");
pref("web.exa.baseUrl", "https://api.exa.ai");
pref("web.exa.searchPath", "/search");

// ── Web Search: xAI ──
pref("web.xai.enabled", true);
pref("web.xai.apiKey", "");
pref("web.xai.baseUrl", "https://api.x.ai/v1");
pref("web.xai.model", "grok-4.20-beta-latest-non-reasoning");
pref("web.xai.searchMode", "official");
pref("web.xai.responsesPath", "/responses");
pref("web.xai.socialBaseUrl", "");
pref("web.xai.socialSearchPath", "/social/search");
