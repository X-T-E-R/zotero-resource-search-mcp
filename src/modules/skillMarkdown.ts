/**
 * Generates SKILL.md text for Agent export (port from current settings).
 */

export function generateSkillMd(port: number): string {
  const url = `http://127.0.0.1:${port}/mcp`;
  return `---
name: zotero-resource-search-mcp
description: Search academic and web resources, resolve DOI/PMID/ISBN, extract URLs, add items to Zotero, list collections, fetch PDFs via MCP inside Zotero. Use when the user asks for literature search, web research, or Zotero automation with this plugin.
---

# Zotero Resource Search MCP — Agent Skill

## When to use

- Academic or web search, DOI/PMID/arXiv/ISBN lookup, URL extraction, adding to Zotero, collections, PDF fetch.
- Keywords: \`academic_search\`, \`web_search\`, \`resource_add\`, \`zotero\`, MCP, Resource Search MCP.

## Connection

- **Endpoint:** \`${url}\` (port is set in Zotero → Settings → Resource Search MCP)
- **Protocol:** JSON-RPC 2.0 over HTTP POST, Streamable HTTP MCP
- **Content-Type:** \`application/json\`

### Initialize (once per session)

\`\`\`json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cursor","version":"1.0"}}}
\`\`\`

### Tool call

\`\`\`json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"<tool>","arguments":{}}}
\`\`\`

## Tools (8)

| Tool | Role |
|------|------|
| \`academic_search\` | Search pluggable academic sources (built-in + user packages) |
| \`web_search\` | Unified web search (Tavily/Firecrawl/Exa/xAI or MySearch Proxy) |
| \`web_research\` | Multi-step research (search + scrape + optional social) |
| \`resource_lookup\` | Identifier lookup or URL content extract |
| \`resource_add\` | Add item/URL to library (optional \`fetchPDF\`) |
| \`collection_list\` | List collections |
| \`resource_pdf\` | Fetch PDF for existing item |
| \`platform_status\` | Academic + web provider availability |

## Custom search sources

Academic sources are **packages** (\`manifest.json\` + \`provider.js\`) loaded at startup. Users can install zips or use a remote registry from plugin settings. See repository \`docs/development/provider-sdk.md\`.

## Notes

- Call \`initialize\` before first \`tools/call\`.
- Web search needs API keys or MySearch Proxy in Zotero settings.
- \`fetchPDF\` can take 10–30s.

## Acknowledgments

Web routing patterns adapted from [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy).
`;
}
