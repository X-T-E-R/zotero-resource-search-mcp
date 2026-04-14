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
