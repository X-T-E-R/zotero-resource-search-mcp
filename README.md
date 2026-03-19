# Zotero Resource Search MCP

A Zotero 7 plugin that exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server, enabling AI agents to search academic literature and web resources, manage Zotero collections, and fetch PDFs — all through a unified JSON-RPC interface.

## Features

- **Academic Search** — Federated search across 10 platforms: arXiv, Crossref, PubMed, Web of Science, Semantic Scholar, Scopus, ZJU Summon, CQVIP, bioRxiv, medRxiv
- **Web Search** — Unified web search with auto-routing to Tavily, Firecrawl, Exa, xAI, or a [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) gateway
- **Web Research** — Multi-step research workflow: web discovery + page scraping + social search
- **Resource Lookup** — Look up papers by DOI/PMID/arXiv ID/ISBN, or extract content from URLs
- **Zotero Integration** — Add items to library, manage collections, auto-fetch PDFs
- **Smart Duplicate Handling** — Detects duplicates; allows adding existing items to different collections

## Installation

1. Download the latest `.xpi` from [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases)
2. In Zotero 7: `Tools` → `Add-ons` → gear icon → `Install Add-on From File…`
3. Select the `.xpi` file
4. Restart Zotero

## Configuration

Open Zotero `Settings` → `Resource Search MCP` to configure:

- **General** — Default sort order, max results, auto-fetch PDF
- **Academic Search** — Enable/disable platforms, enter API keys (WoS, Scopus, etc.)
- **Web Search** — Enter API keys for Tavily/Firecrawl/Exa/xAI, or configure MySearch Proxy
- **Infrastructure** — MCP server port (default: 23121), log level

## MCP Connection

The plugin runs an MCP server on `http://127.0.0.1:23121/mcp` (Streamable HTTP transport).

### For Cursor / AI Editors

Add to your MCP config (`.cursor/mcp.json` or equivalent):

```json
{
  "mcpServers": {
    "zotero-resource-search": {
      "url": "http://127.0.0.1:23121/mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|---|---|
| `academic_search` | Search academic platforms (arXiv, WoS, PubMed, etc.) |
| `web_search` | Unified web search with auto-routing |
| `web_research` | Multi-step research: search + scrape + social |
| `resource_lookup` | Look up by DOI/PMID/ISBN or extract URL content |
| `resource_add` | Add resources to Zotero library |
| `collection_list` | List Zotero collections |
| `resource_pdf` | Fetch PDF for existing items |
| `platform_status` | Check platform availability |

See [`skill/SKILL.md`](skill/SKILL.md) for full tool documentation with parameters and examples.

## Building from Source

```bash
# Install dependencies
npm install

# Development (hot-reload with Zotero)
npm start

# Production build
npm run build

# Output: .scaffold/build/zotero-resource-search-mcp.xpi
```

**Requirements:** Node.js 18+, Zotero 7

## Project Structure

```
src/
├── actions/          # Business logic (SearchAction, AddAction, LookupAction)
├── infra/            # Infrastructure (HttpClient, ConfigProvider, Logger)
├── mcp/              # MCP server, tool schemas, request handling
├── models/           # TypeScript types (ResourceItem, SearchOptions, etc.)
├── providers/
│   ├── academic/     # 10 academic search providers
│   ├── web/          # Web search clients + router (Tavily, Firecrawl, Exa, xAI, MySearch)
│   └── resolvers/    # Metadata resolvers (Crossref DOI)
└── zotero/           # Zotero API helpers (CollectionHelper, PdfFetcher, etc.)
addon/
├── content/          # Preferences UI (XHTML)
├── locale/           # Localization (en-US, zh-CN)
└── prefs.js          # Default preference values
skill/
└── SKILL.md          # AI agent skill documentation
```

## Acknowledgments

- Web search routing logic adapted from [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) by skernelx
- Built with [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) and [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)

## License

MIT
