<p align="center">
  <b>Zotero Resource Search MCP</b><br/>
  Academic &amp; web search, lookup, and Zotero integration — via MCP.
</p>

<p align="center">
  <a href="./README-zh.md"><b>中文文档（简体）</b></a>
</p>

<p align="center">
  <a href="https://github.com/X-T-E-R/zotero-resource-search-mcp/releases"><img src="https://img.shields.io/github/v/release/X-T-E-R/zotero-resource-search-mcp?label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Zotero-7%2B-green" alt="Zotero 7+" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-blue" alt="MCP" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" /></a>
</p>

---

A **Zotero 7+** plugin (manifest: `strict_min_version` 6.999 → Zotero 7.0 and newer; `strict_max_version` open) that runs a **Streamable HTTP MCP** server inside Zotero so AI assistants can search academic and web sources, resolve identifiers, add items, list collections, and fetch PDFs through **8 unified tools**.

> **Note on ZJU Summon:** The optional ZJU Summon provider is intended for **on-campus / institutional IP** access. It is not a general public API — enable it only when you are on an allowed network.

---

## Quick start

### 1. Install the plugin

1. Download the latest `.xpi` from [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases)
2. Zotero → `Tools` → `Add-ons` → gear → `Install Add-on From File…`
3. Restart Zotero

After installation, Zotero’s add-on updater can use the published `update.json` from GitHub (see `update_url` in the built manifest). Use **Check for Updates** in the Add-ons manager when you want to upgrade.

### 2. Enable the MCP server

Zotero → `Edit` → `Settings` → **Resource Search MCP**:

- Ensure the MCP server is enabled (default port **`23121`**)

### 3. Connect your AI client

#### MCP configuration

```json
{
  "mcpServers": {
    "zotero-resource-search": {
      "transport": "streamable_http",
      "url": "http://127.0.0.1:23121/mcp"
    }
  }
}
```

**Where to put this**

| Client | Location |
|--------|----------|
| **Cursor IDE** | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) |
| **Claude Desktop** | `claude_desktop_config.json` ([docs](https://modelcontextprotocol.io/quickstart/user)) |
| **Claude Code** | `claude mcp add --transport http zotero-resource-search http://127.0.0.1:23121/mcp` |
| **Cherry Studio** | Settings → MCP Servers → import JSON |
| **Gemini CLI** | `~/.gemini/settings.json` |
| **Chatbox** | Settings → MCP server configuration |
| **Trae AI** | Ctrl+U → AI Management → MCP |
| **Cline (VS Code)** | MCP Servers → Advanced Settings |
| **Continue.dev** | `~/.continue/config.json` |
| **Codex CLI** | `codex mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http` |
| **Qwen Code** | `qwen mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http` |

#### Agent Skill (recommended)

Copy [`skill/SKILL.md`](./skill/SKILL.md) into your IDE skill folder, e.g.:

```bash
mkdir -p ~/.cursor/skills/zotero-resource-search-mcp
cp skill/SKILL.md ~/.cursor/skills/zotero-resource-search-mcp/
```

---

## Features

- **Academic search** — arXiv, Crossref, PubMed, Web of Science, Semantic Scholar, Scopus, CQVIP, bioRxiv, medRxiv; optional **ZJU Summon** (institutional IP only, see note above)
- **Web search** — Tavily, Firecrawl, Exa, xAI, or a [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) gateway with routing similar to upstream
- **Web research** — search + scrape + optional social/X-style paths (when configured)
- **Resource lookup** — DOI / PMID / arXiv / ISBN, or URL content extraction
- **Zotero integration** — `resource_add` with collection paths, duplicate rules, optional PDF fetch
- **Platform status** — academic + web provider health in one call

---

## The 8 tools

| Tool | Purpose |
|------|---------|
| `academic_search` | Federated academic search |
| `web_search` | Unified web search (router) |
| `web_research` | Multi-step web research |
| `resource_lookup` | Identifier lookup or URL extract |
| `resource_add` | Add items / URLs to the library |
| `collection_list` | List collections (tree or flat) |
| `resource_pdf` | Fetch PDF for an existing item |
| `platform_status` | Status by source type |

Full parameters and examples → [`skill/SKILL.md`](./skill/SKILL.md)

---

## Plugin settings (summary)

- **General** — default sort, max results, default `fetchPDF`
- **Academic** — enable platforms, API keys, per-provider advanced options
- **Web** — MySearch Proxy and/or individual provider keys
- **Infrastructure** — MCP port, log level

---

## Building from source

**Prerequisites:** Node.js 18+, npm, Git; **Zotero** 7+ for running the `.xpi`.

```bash
git clone https://github.com/X-T-E-R/zotero-resource-search-mcp.git
cd zotero-resource-search-mcp
npm install
npm run build    # → .scaffold/build/zotero-resource-search-mcp.xpi
npm start        # dev: hot reload with local Zotero
```

Release maintainers: after bumping `package.json` version and tagging, CI can build and attach assets. Locally you can run `npm run prepare-release` to regenerate root `update.json` / `update-beta.json` (used for add-on update manifests).

---

## Project layout

```
src/
├── actions/          # Search, add, lookup
├── mcp/              # MCP tools + JSON-RPC handling
├── providers/
│   ├── academic/     # Academic search providers
│   ├── web/          # Web clients + router
│   └── resolvers/    # e.g. Crossref
├── zotero/           # Collections, PDF, duplicates
addon/                # manifest, prefs, preferences UI, locales
skill/SKILL.md        # Agent-oriented tool reference
```

---

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| MCP connection failed | Zotero running, server enabled, correct port in settings |
| Tools not listed | Restart the AI client after editing MCP config |
| Academic provider unavailable | Check API keys and `platform_status` |
| Web search empty | Configure at least one web provider or MySearch Proxy |
| ZJU Summon no results | Requires eligible institutional network / IP |

---

## License

[MIT License](./LICENSE)

## Acknowledgments

- Web routing patterns adapted from [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) (skernelx)
- Built with [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) and [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)
