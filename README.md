<p align="center">
  <b>Zotero Resource Search MCP</b><br/>
  Search papers, patents, and the web from Zotero, then save results directly into your library.
</p>

<p align="center">
  <a href="./README-zh.md"><b>简体中文</b></a>
</p>

<p align="center">
  <a href="https://github.com/X-T-E-R/zotero-resource-search-mcp/releases"><img src="https://img.shields.io/github/v/release/X-T-E-R/zotero-resource-search-mcp?label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Zotero-7%2B-green" alt="Zotero 7+" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-blue" alt="MCP" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" /></a>
</p>

---

## What It Does

`Zotero Resource Search MCP` is a Zotero 7 add-on with a built-in MCP server.

It lets AI clients and local tools:

- search academic sources
- search patent sources
- search the web
- look up metadata by DOI, PMID, arXiv ID, ISBN, or URL
- add results directly into Zotero collections
- fetch PDFs for saved items

The plugin itself is the executor. Search sources are installable and extensible, so you are not locked into a fixed built-in database list.

---

## Quick Start

### 1. Install the plugin

1. Download the latest `.xpi` from [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases).
2. In Zotero: `Tools` -> `Add-ons` -> gear icon -> `Install Add-on From File...`
3. Restart Zotero.

### 2. Turn on the MCP server

In Zotero: `Edit` -> `Settings` -> `Resource Search MCP`

- enable `MCP server`
- keep the default port `23121`, or choose your own

### 3. Connect your AI client

Example MCP config:

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

Common locations:

- Cursor: `.cursor/mcp.json` or `~/.cursor/mcp.json`
- Claude Desktop: `claude_desktop_config.json`
- Claude Code: `claude mcp add --transport http zotero-resource-search http://127.0.0.1:23121/mcp`
- Codex CLI: `codex mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`
- Qwen Code: `qwen mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`

---

## Search Sources

Academic and patent sources are installed separately from the plugin.

You can:

- set a provider repository URL in plugin settings
- click `Check registry` to install or update source packages
- import a provider `.zip` manually

Official provider repository:

`https://github.com/X-T-E-R/resource-search-providers`

If no academic source is installed, the plugin will remind you in settings and guide you to configure a provider repository URL.

---

## Main Tools

The plugin currently exposes 10 MCP tools:

- `academic_search`
- `patent_search`
- `patent_detail`
- `web_search`
- `web_research`
- `resource_lookup`
- `resource_add`
- `collection_list`
- `resource_pdf`
- `platform_status`

Full examples and parameter details: [docs/skills/SKILL.md](./docs/skills/SKILL.md)

---

## Typical Use Cases

- Search papers from multiple academic sources and save them to a Zotero collection
- Search patents and write normalized patent items into Zotero
- Run web research from an AI client, then save useful pages to Zotero
- Look up a DOI or PMID and add the result without manual copy-paste

---

## Build From Source

Requirements:

- Node.js 18+
- npm
- Git
- Zotero 7+

```bash
git clone https://github.com/X-T-E-R/zotero-resource-search-mcp.git
cd zotero-resource-search-mcp
npm install
npm run build
```

This produces a build under `.scaffold/build/`, and `npm run build:xpi` creates an installable package under `dist/`.

---

## Troubleshooting

- Cannot connect to MCP: make sure Zotero is running, MCP is enabled, and the port matches your client config
- No academic source available: open plugin settings and configure a provider repository URL
- Web search returns nothing: configure at least one web backend in settings
- A provider fails to load: check `platform_status` and the Zotero debug log

---

## Developer Docs

- Design notes: [docs/DESIGN.md](./docs/DESIGN.md)
- Provider SDK: [docs/development/provider-sdk.md](./docs/development/provider-sdk.md)
- Agent skill examples: [docs/skills/SKILL.md](./docs/skills/SKILL.md)

---

## License

[MIT License](./LICENSE)

## Author

**xter** - [GitHub](https://github.com/X-T-E-R) - [xter.org](https://xter.org)

## Acknowledgments

- [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy)
- [paper-search-mcp-nodejs](https://github.com/Dianel555/paper-search-mcp-nodejs)
- [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)
