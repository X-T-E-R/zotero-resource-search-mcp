<p align="center">
  <b>Zotero Resource Search MCP</b><br/>
  Search executor for Zotero — MCP tools, built-in sources, and your own packages.
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

## What is this?

A **Zotero 7+** add-on that embeds a **Streamable HTTP MCP** server. AI clients get **8 tools** to search literature and the web, resolve identifiers, extract URLs, and write into your library — without shipping a fixed, closed list of databases.

| Layer                        | What you get                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Executor**                 | MCP server + tool handlers + Zotero integration (collections, PDFs, duplicates).                                                                       |
| **Default academic sources** | Shipped as pluggable packages (`manifest.json` + `provider.js`): arXiv, Crossref, PubMed, WoS, Semantic Scholar, Scopus, CQVIP, bioRxiv, medRxiv, etc. |
| **Optional ZJU Summon**      | Campus / **institutional IP** only — not a public API. Enable only on allowed networks.                                                                |
| **Web search**               | Router over Tavily / Firecrawl / Exa / xAI, or an optional [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) gateway.                       |
| **Your sources**             | Add or override packages: **Import .zip**, drop folders under the profile path, or use a **remote registry** URL in settings.                          |

Design rationale: [docs/DESIGN.md](./docs/DESIGN.md). Authoring custom sources: [docs/development/provider-sdk.md](./docs/development/provider-sdk.md).

---

## Quick start

### 1. Install

1. Download the latest `.xpi` from [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases).
2. Zotero → `Tools` → `Add-ons` → gear → `Install Add-on From File…`
3. Restart Zotero.

Updates: the built-in `update_url` points at GitHub `update.json`; use **Add-ons → Check for Updates** when you want to upgrade.

### 2. Enable MCP

Zotero → `Edit` → `Settings` → **Resource Search MCP** → enable **MCP server** (default port **23121**).

### 3. Connect your AI client

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

| Client              | Where to put the config                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| **Cursor**          | `.cursor/mcp.json` or `~/.cursor/mcp.json`                                                 |
| **Claude Desktop**  | `claude_desktop_config.json` ([MCP docs](https://modelcontextprotocol.io/quickstart/user)) |
| **Claude Code**     | `claude mcp add --transport http zotero-resource-search http://127.0.0.1:23121/mcp`        |
| **Cherry Studio**   | Settings → MCP → import JSON                                                               |
| **Gemini CLI**      | `~/.gemini/settings.json`                                                                  |
| **Chatbox**         | MCP server settings                                                                        |
| **Trae AI**         | Ctrl+U → AI Management → MCP                                                               |
| **Cline (VS Code)** | MCP Servers → Advanced                                                                     |
| **Continue.dev**    | `~/.continue/config.json`                                                                  |
| **Codex CLI**       | `codex mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`                  |
| **Qwen Code**       | `qwen mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`                   |

### 4. Agent Skill (recommended)

- **From Zotero:** Settings → **Agent Skills** → choose target → **Export** or **Install to IDE** (embeds the current port).
- **From repo:** copy [`docs/skills/SKILL.md`](./docs/skills/SKILL.md) into e.g. `~/.cursor/skills/zotero-resource-search-mcp/SKILL.md`.

---

## The 8 tools

| Tool              | Purpose                                                 |
| ----------------- | ------------------------------------------------------- |
| `academic_search` | Search registered academic providers                    |
| `web_search`      | Unified web search                                      |
| `web_research`    | Multi-step research (search + scrape + optional social) |
| `resource_lookup` | DOI / PMID / arXiv / ISBN or URL extract                |
| `resource_add`    | Add items or URLs to the library                        |
| `collection_list` | List collections                                        |
| `resource_pdf`    | Fetch PDF for an item                                   |
| `platform_status` | Academic + web health                                   |

Full parameter reference: [`docs/skills/SKILL.md`](./docs/skills/SKILL.md).

---

## Settings overview

- **General** — default sort, max results, default `fetchPDF`
- **Academic** — enable built-in platforms, API keys, per-platform options
- **Web** — MySearch Proxy and/or Tavily, Firecrawl, Exa, xAI
- **Pluggable Search Providers** — list, import zip, reload, registry URL
- **Agent Skills** — export / install `SKILL.md` for Cursor, Claude Code, Codex
- **Infrastructure** — MCP port, log level

The Sources tab now renders academic provider settings from each provider's `configSchema`, and surfaces loader / backend startup errors inline instead of silently showing an empty list.

User provider directory: `<Zotero profile>/zotero-resource-search/providers/<id>/`.

---

## Build from source

Requires **Node.js 18+**, **npm**, **Git**, and **Zotero 7+** to run the XPI.

```bash
git clone https://github.com/X-T-E-R/zotero-resource-search-mcp.git
cd zotero-resource-search-mcp
npm install
npm run build    # → .scaffold/build/zotero-resource-search-mcp.xpi
npm start        # dev + hot reload
```

Release flow: bump `package.json`, `npm run prepare-release`, tag `vX.Y.Z`, push (see [docs/development/versioning.md](./docs/development/versioning.md)).

---

## Repository layout

```
docs/
  DESIGN.md
  skills/SKILL.md
  development/
    versioning.md
    provider-sdk.md
src/
  actions/           # Search, add, lookup
  mcp/               # Tools + JSON-RPC
  providers/
    packages/        # Built-in provider sources (→ addon/providers)
    loader.ts        # Load builtin + user packages
    web/             # Web router + clients
  zotero/            # Collections, PDF, duplicates
addon/               # Manifest, prefs UI, locales, built providers
```

---

## Troubleshooting

| Issue                   | Try                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Cannot connect to MCP   | Zotero running, server enabled, port matches config                                                       |
| Tools missing in client | Restart the client after editing MCP config                                                               |
| Academic source missing | `platform_status`; check `registered` / `enabled` / `configured` / `error`, then try **Reload providers** |
| Web search empty        | Configure at least one web key or MySearch Proxy                                                          |
| Custom provider fails   | Check debug log; validate manifest + `permissions.urls`                                                   |

`platform_status` now returns structured diagnostics for both academic providers and web backends, including whether each one is registered, enabled, configured, currently available, and the last startup/runtime error if known.

---

## License

[MIT License](./LICENSE)

## Author

**xter** — [GitHub](https://github.com/X-T-E-R) · [xter.org](https://xter.org)

## Acknowledgments

- Web routing influenced by [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) (skernelx)
- [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit), [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)
