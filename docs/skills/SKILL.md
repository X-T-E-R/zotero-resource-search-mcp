# Zotero Resource Search MCP

这个技能文档面向会调用 MCP 的 IDE / Agent。它对应 Zotero 插件里本地启动的 MCP 服务，用来检索论文、专利、网页内容，并把结果写入 Zotero。

## 连接方式

- Endpoint: `http://127.0.0.1:23121/mcp`
- Help: `http://127.0.0.1:23121/mcp/help`
- Status: `http://127.0.0.1:23121/mcp/status`
- 协议：JSON-RPC 2.0 over HTTP POST

首次会话先调用一次 `initialize`，然后再调用 `tools/call`。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "codex", "version": "1.0" }
  }
}
```

如果需要当前可用工具、源列表和 provider 用法，优先调用：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { "name": "mcp_help", "arguments": { "topic": "overview" } }
}
```

## 典型工具

- `mcp_help`：返回 MCP 概览、工具说明、provider 用法示例。
- `academic_search`：检索论文/学术资源。
- `patent_search`：检索专利；PatentStar 支持 `patentType`、`legalStatus`、`database`、`rawQuery` 等增强参数。
- `patent_detail`：按 provider 原生 ID 拉取专利详情。
- `web_search` / `web_research`：网页与调研检索。
- `resource_lookup` / `resource_add`：按 DOI/PMID/URL 查找并写入 Zotero。

## PatentStar 示例

按专利类型筛选：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "patent_search",
    "arguments": {
      "platform": "patentstar",
      "query": "石墨烯传感器",
      "patentType": "invention",
      "maxResults": 5
    }
  }
}
```

直接传专家检索式：

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "patent_search",
    "arguments": {
      "platform": "patentstar",
      "rawQuery": "F TI 石墨烯自支撑膜传感器",
      "maxResults": 5
    }
  }
}
```

## 使用提醒

- 具体 provider 的可用性取决于当前 Zotero 插件里已经安装并启用的源。
- 需要凭据的源，请先在 Zotero 设置页对应源卡片内完成配置并“测活”。
- `mcp_help` 与 `/mcp/help` 会优先返回运行时实际已加载 provider 的说明，不要自己硬编码平台列表。
