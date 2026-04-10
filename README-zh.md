<p align="center">
  <b>Zotero Resource Search MCP</b><br/>
  通过 MCP 实现学术与网页检索、元数据解析与 Zotero 一体化写入。
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

**Zotero 7+** 插件（清单中 `strict_min_version` 为 6.999，即自 Zotero 7.0 起；`strict_max_version` 为开放上限），在 Zotero 内嵌 **Streamable HTTP MCP** 服务，让 AI 助手通过 **8 个统一工具** 完成学术与网页检索、标识符解析、条目写入、合集浏览与 PDF 获取等操作。

> **关于 ZJU Summon：** 该可选检索源主要面向 **校园网 / 机构 IP** 访问场景，并非面向公众的通用 API——仅在具备访问权限的网络环境下再启用。

---

## 快速上手

### 1. 安装插件

1. 在 [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases) 下载最新 `.xpi`
2. Zotero → `工具` → `附加组件` → 齿轮 → `从文件安装附加组件…`
3. 重启 Zotero

安装后，可通过 Zotero 附加组件的 **检查更新** 获取新版本（构建产物中的 `update_url` 指向 GitHub 上的 `update.json`）。

### 2. 启用 MCP 服务

Zotero → `编辑` → `设置` → **Resource Search MCP**：

- 启用 MCP 服务（默认端口 **`23121`**）

### 3. 连接 AI 客户端

#### MCP 配置示例

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

**各客户端配置位置**

| 客户端 | 配置位置 |
|--------|----------|
| **Cursor IDE** | `.cursor/mcp.json`（项目）或 `~/.cursor/mcp.json`（全局） |
| **Claude Desktop** | `claude_desktop_config.json`（[说明](https://modelcontextprotocol.io/quickstart/user)） |
| **Claude Code** | `claude mcp add --transport http zotero-resource-search http://127.0.0.1:23121/mcp` |
| **Cherry Studio** | 设置 → MCP Servers → 从 JSON 导入 |
| **Gemini CLI** | `~/.gemini/settings.json` |
| **Chatbox** | 设置 → MCP 服务器配置 |
| **Trae AI** | Ctrl+U → AI Management → MCP |
| **Cline (VS Code)** | MCP Servers → Advanced Settings |
| **Continue.dev** | `~/.continue/config.json` |
| **Codex CLI** | `codex mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http` |
| **Qwen Code** | `qwen mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http` |

#### Agent Skill（推荐）

将 [`skill/SKILL.md`](./skill/SKILL.md) 复制到 IDE 的 skill 目录，例如：

```bash
mkdir -p ~/.cursor/skills/zotero-resource-search-mcp
cp skill/SKILL.md ~/.cursor/skills/zotero-resource-search-mcp/
```

---

## 功能特性

- **学术检索** — arXiv、Crossref、PubMed、Web of Science、Semantic Scholar、Scopus、CQVIP、bioRxiv、medRxiv；可选 **ZJU Summon**（需机构 IP，见上文说明）
- **网页检索** — Tavily、Firecrawl、Exa、xAI，或 [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy) 统一网关（路由逻辑参考上游）
- **网页研究** — 检索 + 抓取 + 可选社交/X 类路径（视配置而定）
- **资源解析** — DOI / PMID / arXiv / ISBN，或 URL 正文抽取
- **Zotero 集成** — `resource_add` 支持合集路径、重复策略、可选 PDF 拉取
- **平台状态** — 一次调用查看学术与网页侧可用性

---

## 8 个工具

| 工具 | 用途 |
|------|------|
| `academic_search` | 学术联邦检索 |
| `web_search` | 统一网页检索（路由器） |
| `web_research` | 多步网页研究 |
| `resource_lookup` | 标识符解析或 URL 抽取 |
| `resource_add` | 写入条目或网页到文库 |
| `collection_list` | 列出合集（树形或扁平） |
| `resource_pdf` | 为已有条目获取 PDF |
| `platform_status` | 按来源类型查看状态 |

完整参数与示例见 [`skill/SKILL.md`](./skill/SKILL.md)

---

## 插件设置（摘要）

- **常规** — 默认排序、最大条数、默认是否 `fetchPDF`
- **学术** — 启用平台、API 密钥、各平台高级参数
- **网页** — MySearch Proxy 与/或各服务商密钥
- **基础设施** — MCP 端口、日志级别

---

## 从源码构建

**环境：** Node.js 18+、npm、Git；运行 `.xpi` 需要 **Zotero** 7+。

```bash
git clone https://github.com/X-T-E-R/zotero-resource-search-mcp.git
cd zotero-resource-search-mcp
npm install
npm run build    # 产物：.scaffold/build/zotero-resource-search-mcp.xpi
npm start        # 开发：与本地 Zotero 热重载
```

维护发布：在提升 `package.json` 版本并打 tag 后，可由 CI 构建并上传附件。本地也可执行 `npm run prepare-release` 重新生成仓库根目录的 `update.json` / `update-beta.json`（用于附加组件更新清单）。

---

## 项目结构

```
src/
├── actions/          # 检索、添加、解析
├── mcp/              # MCP 工具与 JSON-RPC
├── providers/
│   ├── academic/     # 学术检索提供方
│   ├── web/          # 网页客户端与路由
│   └── resolvers/    # 如 Crossref
├── zotero/           # 合集、PDF、重复检测
addon/                # 清单、偏好、设置界面、语言包
skill/SKILL.md        # 面向 Agent 的工具说明
```

---

## 故障排除

| 现象 | 建议 |
|------|------|
| MCP 无法连接 | 确认 Zotero 已运行、服务已启用、端口与设置一致 |
| 客户端无工具 | 修改 MCP 配置后重启 AI 客户端 |
| 某学术源不可用 | 检查 API Key，并用 `platform_status` 查看 |
| 网页检索无结果 | 至少配置一个网页提供方或 MySearch Proxy |
| ZJU Summon 无结果 | 需在具备权限的机构网络 / IP 下使用 |

---

## 许可证

[MIT License](./LICENSE)

## 致谢

- 网页路由思路参考 [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy)（skernelx）
- 构建基于 [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit) 与 [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)
