<p align="center">
  <b>Zotero Resource Search MCP</b><br/>
  面向 Zotero 的检索执行器 — MCP 工具、内置源、可自写扩展包。
</p>

<p align="center">
  <a href="./README.md"><b>English documentation</b></a>
</p>

<p align="center">
  <a href="https://github.com/X-T-E-R/zotero-resource-search-mcp/releases"><img src="https://img.shields.io/github/v/release/X-T-E-R/zotero-resource-search-mcp?label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Zotero-7%2B-green" alt="Zotero 7+" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-blue" alt="MCP" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" /></a>
</p>

---

## 这是什么？

一款 **Zotero 7+** 插件，在 Zotero 内嵌 **Streamable HTTP MCP** 服务。AI 客户端通过 **8 个工具** 完成文献与网页检索、标识符解析、网页抽取与文库写入 —— **不是**绑死一组封闭数据库名单。

| 层次                | 说明                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **执行器**          | MCP 服务、工具分发、与 Zotero 集成（合集、PDF、重复策略）。                                                                                 |
| **默认学术源**      | 以可插拔包（`manifest.json` + `provider.js`）随包分发：arXiv、Crossref、PubMed、WoS、Semantic Scholar、Scopus、CQVIP、bioRxiv、medRxiv 等。 |
| **可选 ZJU Summon** | 需 **校园网 / 机构 IP**，非公开 API；仅在可访问网络下启用。                                                                                 |
| **网页检索**        | 对 Tavily / Firecrawl / Exa / xAI 或可选 [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) 做路由。                              |
| **自有源**          | **导入 zip**、在配置目录放置包、或在设置里填写 **远程 registry** URL。                                                                      |

设计说明见 [docs/DESIGN.md](./docs/DESIGN.md)；自定义源开发见 [docs/development/provider-sdk.md](./docs/development/provider-sdk.md)。

---

## 快速上手

### 1. 安装

1. 从 [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases) 下载 `.xpi`。
2. Zotero → `工具` → `附加组件` → 齿轮 → `从文件安装附加组件…`
3. 重启 Zotero。

更新：`update_url` 指向 GitHub 的 `update.json`，可在附加组件中 **检查更新**。

### 2. 启用 MCP

Zotero → `编辑` → `设置` → **Resource Search MCP** → 启用 **MCP 服务器**（默认端口 **23121**）。

### 3. 连接 AI 客户端

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

| 客户端             | 配置位置                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Cursor**         | `.cursor/mcp.json` 或 `~/.cursor/mcp.json`                                              |
| **Claude Desktop** | `claude_desktop_config.json`（[说明](https://modelcontextprotocol.io/quickstart/user)） |
| **Claude Code**    | `claude mcp add --transport http zotero-resource-search http://127.0.0.1:23121/mcp`     |
| **Cherry Studio**  | 设置 → MCP → 导入 JSON                                                                  |
| **Gemini CLI**     | `~/.gemini/settings.json`                                                               |
| **Chatbox**        | MCP 服务器配置                                                                          |
| **Trae AI**        | Ctrl+U → AI Management → MCP                                                            |
| **Cline**          | MCP Servers → Advanced                                                                  |
| **Continue.dev**   | `~/.continue/config.json`                                                               |
| **Codex CLI**      | `codex mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`               |
| **Qwen Code**      | `qwen mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`                |

### 4. Agent Skill（推荐）

- **在 Zotero 内：** 设置 → **Agent Skills** → 选择目标 → **导出** 或 **安装到 IDE**（自动写入当前端口）。
- **从仓库：** 复制 [`docs/skills/SKILL.md`](./docs/skills/SKILL.md) 到例如 `~/.cursor/skills/zotero-resource-search-mcp/SKILL.md`。

---

## 8 个工具

| 工具              | 用途                               |
| ----------------- | ---------------------------------- |
| `academic_search` | 检索已注册的学术源                 |
| `web_search`      | 统一网页检索                       |
| `web_research`    | 多步研究（检索 + 抓取 + 可选社交） |
| `resource_lookup` | DOI/PMID/arXiv/ISBN 或 URL 抽取    |
| `resource_add`    | 写入条目或网页                     |
| `collection_list` | 列出合集                           |
| `resource_pdf`    | 为条目获取 PDF                     |
| `platform_status` | 学术与网页侧可用性                 |

完整参数：[`docs/skills/SKILL.md`](./docs/skills/SKILL.md)。

---

## 设置项概览

- **通用** — 默认排序、条数、默认 `fetchPDF`
- **学术** — 启用平台、API 密钥、各平台高级项
- **网页** — MySearch Proxy 与/或各服务商 Key
- **可插拔搜索源** — 列表、导入 zip、重载、registry URL
- **Agent Skills** — 导出/安装 Cursor、Claude Code、Codex 用 `SKILL.md`
- **基础设施** — MCP 端口、日志级别

Sources 页现在会根据每个 provider 的 `configSchema` 动态渲染学术源设置，并直接显示 loader / backend 启动错误，而不是静默空白。

用户扩展目录：`<Zotero 配置目录>/zotero-resource-search/providers/<id>/`。

---

## 源码构建

需要 **Node.js 18+**、**npm**、**Git**，以及 **Zotero 7+** 用于运行 XPI。

```bash
git clone https://github.com/X-T-E-R/zotero-resource-search-mcp.git
cd zotero-resource-search-mcp
npm install
npm run build    # 产物：.scaffold/build/zotero-resource-search-mcp.xpi
npm start        # 开发热重载
```

发布流程：提升 `package.json` 版本、`npm run prepare-release`、打 tag `vX.Y.Z` 并推送，见 [docs/development/versioning.md](./docs/development/versioning.md)。

---

## 仓库结构

```
docs/
  DESIGN.md
  skills/SKILL.md
  development/
    versioning.md
    provider-sdk.md
src/
  actions/
  mcp/
  providers/
    packages/        # 内置学术源源码（构建进 addon/providers）
    loader.ts        # 加载内置 + 用户包
    web/
  zotero/
addon/
```

---

## 故障排除

| 现象           | 建议                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| MCP 连不上     | 确认 Zotero 已运行、服务已启用、端口一致                                                                    |
| 客户端无工具   | 修改 MCP 配置后重启客户端                                                                                   |
| 某学术源不可用 | 使用 `platform_status`；查看 `registered` / `enabled` / `configured` / `error`，并尝试 **Reload providers** |
| 网页检索无结果 | 至少配置一个网页 Key 或 MySearch Proxy                                                                      |
| 自定义源失败   | 查看调试日志；检查 manifest 与 `permissions.urls`                                                           |

`platform_status` 现在会返回结构化诊断信息，包含 academic provider 与 web backend 的注册状态、启用状态、配置状态、可用性以及最近错误。

---

## 许可证

[MIT License](./LICENSE)

## 作者

**xter** — [GitHub](https://github.com/X-T-E-R) · [xter.org](https://xter.org)

## 致谢

- 网页路由思路参考 [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy)（skernelx）
- [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)、[zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)
