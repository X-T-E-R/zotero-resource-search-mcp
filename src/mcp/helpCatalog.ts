import { configProvider } from "../infra/ConfigProvider";
import { getProviderStartupReport } from "../providers/loader";
import { providerRegistry } from "../providers/registry";
import { PluggableSearchProvider } from "../providers/pluggable/PluggableSearchProvider";
import type { ProviderHelpExample, ProviderUsageHelp } from "../providers/_sdk/types";
import { webBackendRegistry } from "../providers/web/WebBackendRegistry";
import { getTools } from "./tools";

type HelpLocale = "zh" | "en";

interface HelpOptions {
  topic?: string;
  tool?: string;
  provider?: string;
  locale?: string;
}

interface ProviderHelpEntry {
  id: string;
  name: string;
  sourceType: "academic" | "patent" | "web";
  configured?: boolean;
  available?: boolean;
  summary: string;
  notes: string[];
  examples: ProviderHelpExample[];
}

function resolveLocale(locale?: string): HelpLocale {
  if (locale === "zh" || locale === "en") return locale;
  const current = String((Zotero as any)?.locale || "").toLowerCase();
  return current.startsWith("zh") ? "zh" : "en";
}

function pickLocalizedText(
  locale: HelpLocale,
  values: { zh?: string; en?: string; fallback?: string },
): string {
  if (locale === "zh") return values.zh || values.en || values.fallback || "";
  return values.en || values.zh || values.fallback || "";
}

function pickLocalizedList(
  locale: HelpLocale,
  values: { zh?: string[]; en?: string[]; fallback?: string[] },
): string[] {
  return (
    (locale === "zh" ? values.zh || values.en : values.en || values.zh) || values.fallback || []
  );
}

function buildGenericProviderHelp(
  locale: HelpLocale,
  providerId: string,
  sourceType: "academic" | "patent" | "web",
): ProviderUsageHelp {
  if (sourceType === "patent" && providerId === "patentstar") {
    return {
      summaryZh: "支持普通关键词检索、专家检索式、专利类型/法律状态筛选，以及专利详情拉取。",
      summary:
        "Supports keyword search, expert query syntax, patent type/legal status filters, and detail lookup.",
      notesZh: [
        "普通检索用 query；专家检索可直接传 rawQuery，例如 F TI 石墨烯 and AB 传感器。",
        "patentType 可选 invention、utility_model、design。",
        "legalStatus 可选 valid、invalid、pending。",
      ],
      notes: [
        "Use query for normal search, or rawQuery for expert syntax such as F TI graphene and AB sensor.",
        "patentType supports invention, utility_model, design.",
        "legalStatus supports valid, invalid, pending.",
      ],
      examples: [
        {
          titleZh: "发明专利筛选",
          title: "Invention patents only",
          tool: "patent_search",
          arguments: {
            platform: "patentstar",
            query: "石墨烯传感器",
            patentType: "invention",
            maxResults: 5,
          },
        },
        {
          titleZh: "专家检索示例",
          title: "Expert query example",
          tool: "patent_search",
          arguments: {
            platform: "patentstar",
            rawQuery: "F TI 石墨烯 and AB 传感器",
            query: "石墨烯传感器",
            maxResults: 5,
          },
        },
      ],
    };
  }

  if (sourceType === "academic") {
    return {
      summaryZh: "使用 academic_search 检索论文或学术条目。",
      summary: "Use academic_search to find papers and scholarly records.",
    };
  }

  if (sourceType === "web") {
    const builtins: Record<string, ProviderUsageHelp> = {
      tavily: {
        summaryZh: "适合常规网页与新闻搜索，支持 AI answer、topic 和域名限制。",
        summary:
          "Good for general web/news search, with support for AI answers, topic, and domain filters.",
        notesZh: [
          "常用参数：topic、includeAnswer、includeDomains、excludeDomains。",
          "需要页面内容时可开启 includeContent。",
        ],
        notes: [
          "Common parameters: topic, includeAnswer, includeDomains, excludeDomains.",
          "Enable includeContent when you need page text.",
        ],
      },
      firecrawl: {
        summaryZh: "适合文档、GitHub、PDF 和内容抓取，支持 categories 与正文提取。",
        summary:
          "Best for docs, GitHub, PDF, and content-heavy retrieval, with categories and page extraction.",
        notesZh: ["常用参数：categories、includeContent。"],
        notes: ["Common parameters: categories and includeContent."],
      },
      exa: {
        summaryZh: "适合常规网页与 research 风格检索，支持域名过滤与内容返回。",
        summary:
          "Good for general web and research-style search, with domain filters and optional content.",
        notesZh: ["常用参数：includeDomains、excludeDomains、includeContent。"],
        notes: ["Common parameters: includeDomains, excludeDomains, and includeContent."],
      },
      xai: {
        summaryZh: "适合网页 + X/社交内容检索，支持 sources、账号过滤和时间范围。",
        summary:
          "Best for web + X/social search, with sources, handle filtering, and date range controls.",
        notesZh: ["常用参数：sources、allowedXHandles、excludedXHandles、fromDate、toDate。"],
        notes: [
          "Common parameters: sources, allowedXHandles, excludedXHandles, fromDate, and toDate.",
        ],
      },
      mysearch: {
        summaryZh: "把请求转发到外部 MySearch Proxy，可统一代理网页搜索与提取。",
        summary:
          "Routes requests through an external MySearch Proxy for centralized web search/extraction.",
        notesZh: ["需要先配置 baseUrl，通常也会配 apiKey 和 mcpPath。"],
        notes: ["Configure baseUrl first, and usually apiKey and mcpPath as well."],
      },
    };
    return (
      builtins[providerId] ?? {
        summaryZh: "使用对应 MCP 工具进行网页检索或内容提取。",
        summary: "Use the matching MCP tool for web search or extraction.",
      }
    );
  }

  return {
    summaryZh: "使用对应 MCP 工具进行检索或详情查询。",
    summary: "Use the matching MCP tool for search or detail lookup.",
  };
}

function getProviderHelpEntries(locale: HelpLocale): ProviderHelpEntry[] {
  const report = getProviderStartupReport();
  const statusById = new Map(
    [...report.academic, ...report.patent, ...report.web].map((entry) => [entry.id, entry]),
  );
  const entries = new Map<string, ProviderHelpEntry>();

  for (const provider of providerRegistry.getAll()) {
    const runtime = statusById.get(provider.id);
    const manifestHelp =
      provider instanceof PluggableSearchProvider
        ? provider.manifest.help ||
          buildGenericProviderHelp(locale, provider.id, provider.sourceType)
        : buildGenericProviderHelp(locale, provider.id, provider.sourceType);
    entries.set(provider.id, {
      id: provider.id,
      name: provider.name,
      sourceType: provider.sourceType,
      configured: runtime?.configured,
      available: runtime?.available,
      summary: pickLocalizedText(locale, {
        zh: manifestHelp.summaryZh,
        en: manifestHelp.summary,
        fallback:
          provider instanceof PluggableSearchProvider
            ? provider.manifest.description || provider.name
            : provider.name,
      }),
      notes: pickLocalizedList(locale, {
        zh: manifestHelp.notesZh,
        en: manifestHelp.notes,
      }),
      examples: manifestHelp.examples ?? [],
    });
  }

  const knownWebBackends =
    webBackendRegistry.getAll().length > 0
      ? webBackendRegistry.getAll().map((backend) => ({
          id: backend.id,
          name: backend.name,
          description: backend.description,
          descriptionZh: backend.descriptionZh,
        }))
      : [
          {
            id: "tavily",
            name: "Tavily",
            description: "AI web search and page extraction",
            descriptionZh: "AI 网页搜索与页面提取",
          },
          {
            id: "firecrawl",
            name: "Firecrawl",
            description: "Docs-first search and scraping backend",
            descriptionZh: "偏文档与抓取的网页后端",
          },
          {
            id: "exa",
            name: "Exa",
            description: "Research-oriented web search backend",
            descriptionZh: "偏研究检索的网页后端",
          },
          {
            id: "xai",
            name: "xAI",
            description: "Web and X/social search backend",
            descriptionZh: "网页与 X/社交搜索后端",
          },
          {
            id: "mysearch",
            name: "MySearch Proxy",
            description: "External proxy backend for web search/extraction",
            descriptionZh: "外部网页搜索 / 提取代理后端",
          },
        ];

  for (const backend of knownWebBackends) {
    const runtime = statusById.get(backend.id);
    const help = buildGenericProviderHelp(locale, backend.id, "web");
    entries.set(backend.id, {
      id: backend.id,
      name: backend.name,
      sourceType: "web",
      configured: runtime?.configured,
      available: runtime?.available,
      summary: pickLocalizedText(locale, {
        zh: help.summaryZh,
        en: help.summary,
        fallback: locale === "zh" ? backend.descriptionZh || backend.name : backend.description,
      }),
      notes: pickLocalizedList(locale, {
        zh: help.notesZh,
        en: help.notes,
      }),
      examples: help.examples ?? [],
    });
  }

  return [...entries.values()]
    .map((provider) => {
      return provider satisfies ProviderHelpEntry;
    })
    .sort((a, b) =>
      a.sourceType === b.sourceType
        ? a.id.localeCompare(b.id)
        : a.sourceType.localeCompare(b.sourceType),
    );
}

function buildQuickstart(locale: HelpLocale, port: number): string[] {
  return locale === "zh"
    ? [
        `MCP 地址：http://127.0.0.1:${port}/mcp`,
        "首次会话先发送 initialize，再发送 tools/call。",
        "可先调用 mcp_help 或 platform_status 查看当前可用源和用法。",
      ]
    : [
        `MCP endpoint: http://127.0.0.1:${port}/mcp`,
        "Send initialize once before the first tools/call request.",
        "Use mcp_help or platform_status first to inspect available sources and usage.",
      ];
}

export function createHelpSnapshot(options: HelpOptions = {}) {
  const locale = resolveLocale(options.locale);
  const port = configProvider.getNumber("mcp.server.port", 23121);
  const toolSchemas = getTools();
  const providerEntries = getProviderHelpEntries(locale);

  const toolFilter = (options.tool || "").trim();
  const providerFilter = (options.provider || "").trim();
  const topic = (options.topic || "").trim();

  const filteredTools = toolFilter
    ? toolSchemas.filter((tool) => tool.name === toolFilter)
    : topic === "patents"
      ? toolSchemas.filter((tool) => tool.name.startsWith("patent_"))
      : topic === "tools"
        ? toolSchemas
        : toolSchemas;

  const filteredProviders = providerFilter
    ? providerEntries.filter((provider) => provider.id === providerFilter)
    : topic === "patents"
      ? providerEntries.filter((provider) => provider.sourceType === "patent")
      : topic === "providers"
        ? providerEntries
        : providerEntries;

  return {
    locale,
    server: {
      endpoint: `http://127.0.0.1:${port}/mcp`,
      helpEndpoint: `http://127.0.0.1:${port}/mcp/help`,
      statusEndpoint: `http://127.0.0.1:${port}/mcp/status`,
      protocolVersion: "2024-11-05",
    },
    quickstart: buildQuickstart(locale, port),
    tools: filteredTools,
    providers: filteredProviders,
    note:
      locale === "zh"
        ? "provider 用法来自已加载源的 manifest.help；未声明时回退到插件内置说明。"
        : "Provider usage comes from loaded manifest.help metadata, with plugin-side fallbacks.",
  };
}

function renderExample(locale: HelpLocale, example: ProviderHelpExample): string {
  const title = pickLocalizedText(locale, {
    zh: example.titleZh,
    en: example.title,
    fallback: "Example",
  });
  const description = pickLocalizedText(locale, {
    zh: example.descriptionZh,
    en: example.description,
  });
  const args = example.arguments ? JSON.stringify(example.arguments, null, 2) : "{}";
  return `#### ${title}

${description ? `${description}\n\n` : ""}\`\`\`json
{
  "name": "${example.tool || "tools/call"}",
  "arguments": ${args}
}
\`\`\``;
}

export function renderSkillMarkdown(port: number, localeInput?: string): string {
  const locale = resolveLocale(localeInput);
  const snapshot = createHelpSnapshot({ locale });
  const tools = snapshot.tools
    .map((tool) => `| \`${tool.name}\` | ${tool.description} |`)
    .join("\n");
  const providers = snapshot.providers
    .map((provider) => {
      const notes =
        provider.notes.length > 0 ? provider.notes.map((note) => `- ${note}`).join("\n") : "";
      const examples = provider.examples
        .slice(0, 2)
        .map((example) => renderExample(locale, example))
        .join("\n\n");
      return `### \`${provider.id}\` — ${provider.name}

${provider.summary}

${notes}

${examples}`.trim();
    })
    .join("\n\n");

  return `---
name: zotero-resource-search-mcp
description: ${locale === "zh" ? "通过 Zotero 内置 MCP 搜索论文、专利、网页内容并写入 Zotero。" : "Search papers, patents, and web content through the Zotero MCP plugin and save them to Zotero."}
---

# Zotero Resource Search MCP

## Connection

- Endpoint: \`http://127.0.0.1:${port}/mcp\`
- Help: \`http://127.0.0.1:${port}/mcp/help\`
- Status: \`http://127.0.0.1:${port}/mcp/status\`
- Protocol: JSON-RPC 2.0 over HTTP POST

## Quickstart

${snapshot.quickstart.map((item) => `- ${item}`).join("\n")}

\`\`\`json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"codex","version":"1.0"}}}
\`\`\`

\`\`\`json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mcp_help","arguments":{"topic":"overview"}}}
\`\`\`

## Tools

| Tool | Purpose |
|------|---------|
${tools}

## Provider Usage

${providers}

## Notes

- ${snapshot.note}
- ${locale === "zh" ? "若某个源需要凭据，请先在 Zotero 插件设置页对应源卡片内完成配置并测活。" : "If a provider needs credentials, configure and probe it in the Zotero plugin settings first."}
`;
}
