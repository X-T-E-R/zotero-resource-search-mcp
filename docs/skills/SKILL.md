# Zotero Resource Search MCP

> **Extensibility:** Academic `platform` IDs come from **loaded provider packages** (built-in + user-installed). The list below matches the default bundle; custom zips or registry installs can add new IDs. See [Provider SDK](../development/provider-sdk.md).

Use this skill when the user asks to search for academic papers, web resources, look up papers by DOI/PMID/arXiv ID/ISBN, extract URL content, add items to their Zotero library, list Zotero collections, fetch PDFs, or perform web research. This skill operates via a local MCP server running inside the Zotero plugin.

## Connection

- **Endpoint:** `http://127.0.0.1:23121/mcp` (port configurable in Zotero plugin settings)
- **Protocol:** JSON-RPC 2.0 over HTTP POST
- **Content-Type:** `application/json`

### Session Initialization

Before any tool call, send an `initialize` request once per session:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "cursor", "version": "1.0" }
  }
}
```

### Tool Call Format

```json
{"jsonrpc":"2.0","id":<N>,"method":"tools/call","params":{"name":"<tool_name>","arguments":{...}}}
```

## Available Tools (8 total)

### 1. `academic_search` — Search academic resources

Search across multiple academic platforms. Returns structured metadata for `resource_add`.

| Param        | Type   | Required | Description                                                                                                                           |
| ------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `query`      | string | YES      | Search query                                                                                                                          |
| `platform`   | string | no       | `"all"` (default) or specific: `arxiv`, `crossref`, `pubmed`, `wos`, `zjusummon`, `cqvip`, `semantic`, `scopus`, `biorxiv`, `medrxiv` |
| `maxResults` | number | no       | Max results (default: 25)                                                                                                             |
| `page`       | number | no       | Page number (default: 1)                                                                                                              |
| `year`       | string | no       | Year filter: `"2024"` or range `"2020-2024"`                                                                                          |
| `author`     | string | no       | Author name filter                                                                                                                    |
| `sortBy`     | string | no       | `"relevance"`, `"date"`, or `"citations"`                                                                                             |
| `extra`      | object | no       | Provider-specific: `{"database":"WOK"}` for WoS, `{"days":60}` for bioRxiv                                                            |

```json
{
  "name": "academic_search",
  "arguments": {
    "query": "topology optimization lattice",
    "platform": "wos",
    "maxResults": 5,
    "sortBy": "citations"
  }
}
```

### 2. `web_search` — Unified web search

Auto-routes to Tavily/Firecrawl/Exa/xAI based on query intent. Requires at least one web provider API key configured.

| Param             | Type     | Required | Description                                                                                              |
| ----------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `query`           | string   | YES      | Search query                                                                                             |
| `mode`            | string   | no       | `"auto"`, `"web"`, `"news"`, `"social"`, `"docs"`, `"research"`, `"github"`, `"pdf"`                     |
| `intent`          | string   | no       | `"auto"`, `"factual"`, `"status"`, `"comparison"`, `"tutorial"`, `"exploratory"`, `"news"`, `"resource"` |
| `strategy`        | string   | no       | `"auto"`, `"fast"`, `"balanced"`, `"verify"`, `"deep"`                                                   |
| `provider`        | string   | no       | Force specific: `"auto"`, `"tavily"`, `"firecrawl"`, `"exa"`, `"xai"`                                    |
| `sources`         | string[] | no       | `["web"]`, `["x"]`, or `["web","x"]`                                                                     |
| `max_results`     | number   | no       | Max results (default: 5)                                                                                 |
| `include_content` | boolean  | no       | Include full page text (default: false)                                                                  |
| `include_answer`  | boolean  | no       | Include AI answer (default: true)                                                                        |
| `include_domains` | string[] | no       | Only search these domains                                                                                |
| `exclude_domains` | string[] | no       | Exclude these domains                                                                                    |
| `from_date`       | string   | no       | Start date (YYYY-MM-DD)                                                                                  |
| `to_date`         | string   | no       | End date (YYYY-MM-DD)                                                                                    |

```json
{
  "name": "web_search",
  "arguments": { "query": "latest React 19 features", "mode": "docs", "max_results": 5 }
}
```

### 3. `web_research` — Multi-step research workflow

Web search + top-N page scraping + optional X/social search. Returns comprehensive evidence.

| Param                | Type    | Required | Description                             |
| -------------------- | ------- | -------- | --------------------------------------- |
| `query`              | string  | YES      | Research question                       |
| `web_max_results`    | number  | no       | Web results (default: 5)                |
| `social_max_results` | number  | no       | Social results (default: 5)             |
| `scrape_top_n`       | number  | no       | URLs to scrape (default: 3)             |
| `include_social`     | boolean | no       | Include X/social search (default: true) |
| `mode`               | string  | no       | Search mode (same as `web_search`)      |

```json
{
  "name": "web_research",
  "arguments": { "query": "impact of AI on drug discovery 2024", "scrape_top_n": 3 }
}
```

### 4. `resource_lookup` — Look up by identifier or extract URL

Returns full metadata for an identifier, or extracts content from a URL.

| Param            | Type     | Required | Description                                                 |
| ---------------- | -------- | -------- | ----------------------------------------------------------- |
| `identifier`     | string   | no\*     | DOI, PMID, arXiv ID, or ISBN                                |
| `identifierType` | string   | no       | `"doi"`, `"pmid"`, `"arxiv"`, `"isbn"` (auto-detected)      |
| `url`            | string   | no\*     | URL to extract content from                                 |
| `formats`        | string[] | no       | Output formats for URL extraction (default: `["markdown"]`) |
| `provider`       | string   | no       | Extraction provider: `"auto"`, `"firecrawl"`, `"tavily"`    |

\*At least one of `identifier` or `url` must be provided.

```json
{ "name": "resource_lookup", "arguments": { "identifier": "10.1038/s41586-021-03819-2" } }
```

```json
{
  "name": "resource_lookup",
  "arguments": { "url": "https://example.com/article", "formats": ["markdown"] }
}
```

### 5. `resource_add` — Add to Zotero library

| Param            | Type     | Required | Description                            |
| ---------------- | -------- | -------- | -------------------------------------- |
| `item`           | object   | no\*     | ResourceItem from search/lookup        |
| `url`            | string   | no\*     | URL to add                             |
| `collectionKey`  | string   | no       | Zotero collection key                  |
| `collectionPath` | string   | no       | Path like `"Research/ML/Transformers"` |
| `tags`           | string[] | no       | Extra tags                             |
| `fetchPDF`       | boolean  | no       | Auto-fetch PDF (default from settings) |

\*At least one of `item` or `url`.

Duplicate behavior:

- Same item + same collection: rejected
- Same item + different collection: added to new collection

```json
{"name":"resource_add","arguments":{"item":{...},"collectionPath":"毕设/参考文献","fetchPDF":true}}
```

### 6. `collection_list` — List Zotero collections

| Param  | Type    | Required | Description                          |
| ------ | ------- | -------- | ------------------------------------ |
| `flat` | boolean | no       | Flat list with paths (default: tree) |

### 7. `resource_pdf` — Fetch PDF for existing item

| Param     | Type   | Required | Description     |
| --------- | ------ | -------- | --------------- |
| `itemKey` | string | YES      | Zotero item key |

### 8. `platform_status` — Check all platforms

No parameters. Returns status grouped by type (academic, web).

## Typical Workflows

### Academic literature search

1. `academic_search` with query
2. Pick desired items
3. `resource_add` with item + collection + `fetchPDF: true`

### Web research and save

1. `web_research` with research question
2. Review results and pages
3. `resource_add` to save relevant URLs to Zotero

### Look up by DOI

1. `resource_lookup` with DOI
2. `resource_add` with returned item

### Extract web page content

1. `resource_lookup` with `url` parameter
2. Returns markdown content from the page

## Notes

- Initialize MCP session before first tool call
- Default port: 23121 (configurable in Zotero settings)
- Web search requires API keys (Tavily/Firecrawl/Exa/xAI) configured in settings, or a MySearch Proxy
- `fetchPDF` may take 10-30 seconds
- Prefer passing DOI for best metadata quality

## Acknowledgments

- Web search routing logic adapted from [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) by skernelx
