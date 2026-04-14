<p align="center">
  <b>Zotero Resource Search MCP</b><br/>
  直接在 Zotero 里搜索论文、专利和网页，并把结果写回文库。
</p>

<p align="center">
  <a href="./README.md"><b>English</b></a>
</p>

<p align="center">
  <a href="https://github.com/X-T-E-R/zotero-resource-search-mcp/releases"><img src="https://img.shields.io/github/v/release/X-T-E-R/zotero-resource-search-mcp?label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Zotero-7%2B-green" alt="Zotero 7+" />
  <img src="https://img.shields.io/badge/MCP-Streamable_HTTP-blue" alt="MCP" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow" alt="MIT License" /></a>
</p>

---

## 这是什么

`Zotero Resource Search MCP` 是一个 Zotero 7 插件，内置了 MCP 服务。

它可以让 AI 客户端或本地工具直接：

- 搜索学术资源
- 搜索专利资源
- 搜索网页内容
- 按 DOI、PMID、arXiv ID、ISBN 或 URL 查询元数据
- 把结果直接写入 Zotero 合集
- 为已保存条目抓取 PDF

插件本身负责执行和写入；具体搜索源是可安装、可扩展的，所以不会被一组写死的内建数据库限制住。

---

## 快速开始

### 1. 安装插件

1. 从 [Releases](https://github.com/X-T-E-R/zotero-resource-search-mcp/releases) 下载最新 `.xpi`
2. Zotero 中打开：`工具` -> `附加组件` -> 右上角齿轮 -> `从文件安装附加组件...`
3. 重启 Zotero

### 2. 打开 MCP 服务

在 Zotero 中打开：`编辑` -> `设置` -> `Resource Search MCP`

- 勾选 `MCP server`
- 默认端口是 `23121`，一般不用改

### 3. 连接 AI 客户端

示例配置：

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

常见客户端：

- Cursor: `.cursor/mcp.json` 或 `~/.cursor/mcp.json`
- Claude Desktop: `claude_desktop_config.json`
- Claude Code: `claude mcp add --transport http zotero-resource-search http://127.0.0.1:23121/mcp`
- Codex CLI: `codex mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`
- Qwen Code: `qwen mcp add zotero-resource-search http://127.0.0.1:23121/mcp -t http`

---

## 搜索源怎么装

学术源和专利源不跟插件主包绑死，而是单独安装。

你可以：

- 在插件设置里填写 provider 仓库 URL
- 点击 `Check registry` 自动安装或更新搜索源
- 手动导入 provider `.zip`

官方 provider 仓库：

`https://github.com/X-T-E-R/resource-search-providers`

如果当前没有安装任何学术源，插件会在设置页直接提醒你去配置 provider 仓库地址。

---

## 主要工具

插件当前提供 10 个 MCP 工具：

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

完整参数和示例见：[docs/skills/SKILL.md](./docs/skills/SKILL.md)

---

## 适合做什么

- 从多个学术源搜索论文并直接保存到 Zotero
- 搜索专利并写入标准化的 Zotero patent 条目
- 让 AI 客户端做网页调研，再把有价值的页面存入 Zotero
- 通过 DOI 或 PMID 直接补全元数据，不再手动复制粘贴

---

## 从源码构建

需要：

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

构建产物会出现在 `.scaffold/build/`；执行 `npm run build:xpi` 会在 `dist/` 下生成可安装包。

---

## 常见问题

- 连不上 MCP：确认 Zotero 正在运行、MCP 已启用、端口和客户端配置一致
- 没有学术源可用：打开插件设置，配置 provider 仓库 URL
- 网页搜索没有结果：先在设置里配置至少一个 web backend
- 某个 provider 加载失败：查看 `platform_status` 和 Zotero 调试日志

---

## 开发文档

- 设计说明：[docs/DESIGN.md](./docs/DESIGN.md)
- Provider 开发文档：[docs/development/provider-sdk.md](./docs/development/provider-sdk.md)
- Agent Skill 示例：[docs/skills/SKILL.md](./docs/skills/SKILL.md)

---

## License

[MIT License](./LICENSE)

## 作者

**xter** - [GitHub](https://github.com/X-T-E-R) - [xter.org](https://xter.org)

## 致谢

- [MySearch-Proxy](https://github.com/skernelx/MySearch-Proxy)
- [paper-search-mcp-nodejs](https://github.com/Dianel555/paper-search-mcp-nodejs)
- [zotero-plugin-toolkit](https://github.com/windingwind/zotero-plugin-toolkit)
- [zotero-plugin-scaffold](https://github.com/northword/zotero-plugin-scaffold)
