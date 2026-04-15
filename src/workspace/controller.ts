import { config } from "../../package.json";
import { addAction } from "../actions/AddAction";
import { searchAction } from "../actions/SearchAction";
import { createHelpSnapshot } from "../mcp/helpCatalog";
import { getProviderStartupReport } from "../providers/loader";
import { providerRegistry } from "../providers/registry";
import { getSourceVerifiedState } from "../providers/sourcePrefs";
import { webBackendRegistry } from "../providers/web/WebBackendRegistry";
import { type ResourceItem } from "../models/types";
import type { SearchProvider } from "../models/types";
import { collectionHelper } from "../zotero/CollectionHelper";
import { isWindowAlive } from "../utils/window";
import { resolveWorkspaceSourceStatus } from "./sourceStatus";
import {
  aggregateWebSearches,
  type WorkspaceWebAggregateRequest,
  type WorkspaceWebProviderOptions,
} from "./webAggregation";

export type WorkspaceMode = "academic" | "patent" | "web";

interface WorkspaceProviderDescriptor {
  id: string;
  name: string;
  sourceType: WorkspaceMode;
  description: string;
  configured: boolean;
  available: boolean;
  verified: boolean;
  status: ReturnType<typeof resolveWorkspaceSourceStatus>;
  helpSummary: string;
  helpNotes: string[];
  capabilities?: string[];
}

interface WorkspaceResultItem {
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  url?: string;
  provider: string;
  sourceType: WorkspaceMode;
  raw: Record<string, unknown>;
  resourceItem?: ResourceItem;
}

interface WorkspaceResultGroup {
  provider: string;
  providerName: string;
  sourceType: WorkspaceMode;
  status: "ok" | "error";
  error?: string;
  answer?: string;
  resultCount: number;
  elapsedMs?: number;
  request?: Record<string, unknown>;
  items: WorkspaceResultItem[];
}

export interface WorkspaceSearchResponse {
  mode: WorkspaceMode;
  query: string;
  groups: WorkspaceResultGroup[];
  summary: {
    successCount: number;
    failureCount: number;
    totalResults: number;
  };
}

class WorkspaceController {
  private workspaceWindow: Window | null = null;

  async getBootstrapData(localeInput?: string): Promise<any> {
    const locale = resolveLocale(localeInput);
    const helpSnapshot = createHelpSnapshot({ locale, topic: "providers" });
    const helpById = new Map(helpSnapshot.providers.map((entry) => [entry.id, entry]));
    const startupReport = getProviderStartupReport();
    const runtimeById = new Map(
      [...startupReport.academic, ...startupReport.patent, ...startupReport.web].map((entry) => [
        entry.id,
        entry,
      ]),
    );

    const academic = providerRegistry
      .getAll()
      .filter((provider) => provider.sourceType === "academic")
      .map((provider) =>
        this.buildProviderDescriptor(locale, provider, runtimeById.get(provider.id), helpById),
      );

    const patent = providerRegistry
      .getAll()
      .filter((provider) => provider.sourceType === "patent")
      .map((provider) =>
        this.buildProviderDescriptor(locale, provider, runtimeById.get(provider.id), helpById),
      );

    const webBackends =
      helpSnapshot.providers.filter((entry) => entry.sourceType === "web" && entry.id !== "web") ||
      [];
    const web = webBackends.map((entry) => {
      const runtime = runtimeById.get(entry.id);
      const status = resolveWorkspaceSourceStatus(
        locale,
        runtime?.enabled ?? true,
        runtime?.configured ?? false,
        !!getSourceVerifiedState("web", entry.id),
      );
      const backend = webBackendRegistry.get(entry.id);
      return {
        id: entry.id,
        name: entry.name,
        sourceType: "web",
        description: entry.summary,
        configured: runtime?.configured ?? false,
        available: runtime?.available ?? false,
        verified: !!getSourceVerifiedState("web", entry.id),
        status,
        helpSummary: entry.summary,
        helpNotes: entry.notes,
        capabilities: backend ? [...backend.capabilities] : runtime?.capabilities,
      } satisfies WorkspaceProviderDescriptor;
    });

    return {
      locale,
      general: {
        fetchPDF: Zotero.Prefs.get(`${config.prefsPrefix}.general.fetchPDF`, true) === true,
        maxResults: Number(
          Zotero.Prefs.get(`${config.prefsPrefix}.general.maxResults`, true) ?? 25,
        ),
      },
      collections: collectionHelper.listFlat(),
      providers: { academic, patent, web },
      defaults: {
        academicProvider: pickDefaultProvider(academic),
        patentProvider: pickDefaultProvider(patent),
        webProviders: pickDefaultWebProviders(web),
      },
      help: {
        overview: createHelpSnapshot({ locale, topic: "overview" }),
      },
    };
  }

  getProviderHelp(providerId?: string, localeInput?: string): any {
    return createHelpSnapshot({
      locale: resolveLocale(localeInput),
      provider: providerId,
      topic: providerId ? "providers" : "overview",
    });
  }

  async search(request: {
    mode: WorkspaceMode;
    query: string;
    provider?: string;
    providers?: string[];
    commonOptions?: Record<string, unknown>;
    providerOptions?: Record<string, WorkspaceWebProviderOptions | undefined>;
  }): Promise<WorkspaceSearchResponse> {
    switch (request.mode) {
      case "academic":
        return this.searchAcademicLike(
          "academic",
          request.query,
          request.provider,
          request.commonOptions,
        );
      case "patent":
        return this.searchPatent(request.query, request.provider, request.commonOptions);
      case "web":
        return this.searchWeb({
          query: request.query,
          providers: request.providers ?? [],
          commonOptions: request.commonOptions,
          providerOptions: request.providerOptions,
        });
      default:
        throw new Error(`Unsupported workspace mode: ${request.mode}`);
    }
  }

  async addResult(params: {
    item?: ResourceItem;
    url?: string;
    collectionKey?: string;
    tags?: string[];
    fetchPDF?: boolean;
  }) {
    return addAction.execute(params);
  }

  focusItem(itemKey: string): boolean {
    const libraryID = Zotero.Libraries.userLibraryID;
    const item = Zotero.Items.getByLibraryAndKey(libraryID, itemKey);
    if (!item) {
      return false;
    }
    const win = Zotero.getMainWindows?.()[0] as any;
    if (!win?.ZoteroPane?.selectItem) {
      return false;
    }
    void win.ZoteroPane.selectItem(item.id);
    try {
      win.focus();
    } catch {
      /* ignore */
    }
    return true;
  }

  openWindow(parentWindow?: Window | null): Window | null {
    if (isWindowAlive(this.workspaceWindow || undefined)) {
      this.workspaceWindow!.focus();
      return this.workspaceWindow;
    }

    const anchor = parentWindow || (Zotero.getMainWindows?.()[0] as Window | undefined);
    if (!anchor) {
      return null;
    }

    const win = anchor.openDialog(
      `${rootURI}content/workspace.html`,
      `${config.addonRef}:workspace`,
      "chrome,dialog=no,resizable,centerscreen,width=1440,height=900",
      addon,
    );
    this.workspaceWindow = win;
    win?.addEventListener(
      "unload",
      () => {
        if (this.workspaceWindow === win) {
          this.workspaceWindow = null;
        }
      },
      { once: true },
    );
    return win;
  }

  private buildProviderDescriptor(
    locale: "zh" | "en",
    provider: SearchProvider,
    runtime: any,
    helpById: Map<string, any>,
  ): WorkspaceProviderDescriptor {
    const verified = !!getSourceVerifiedState("platform", provider.id);
    const help = helpById.get(provider.id);
    const status = resolveWorkspaceSourceStatus(
      locale,
      runtime?.enabled ?? provider.isAvailable(),
      runtime?.configured ?? provider.isAvailable(),
      verified,
    );
    return {
      id: provider.id,
      name: provider.name,
      sourceType: provider.sourceType as "academic" | "patent",
      description: help?.summary || provider.name,
      configured: runtime?.configured ?? provider.isAvailable(),
      available: runtime?.available ?? provider.isAvailable(),
      verified,
      status,
      helpSummary: help?.summary || provider.name,
      helpNotes: help?.notes || [],
    };
  }

  private async searchAcademicLike(
    mode: "academic" | "patent",
    query: string,
    providerId: string | undefined,
    commonOptions?: Record<string, unknown>,
  ): Promise<WorkspaceSearchResponse> {
    const selectedProvider = providerId || providerRegistry.getIdsByType(mode)[0];
    if (!selectedProvider) {
      throw new Error(`No ${mode} provider is available`);
    }
    const result = await searchAction.executeBySourceType(query, mode, selectedProvider, {
      maxResults: asNumber(commonOptions?.maxResults),
      sortBy: asString(commonOptions?.sortBy) as "relevance" | "date" | "citations" | undefined,
      year: asString(commonOptions?.year),
      author: asString(commonOptions?.author),
      page: 1,
    });
    const normalized = Array.isArray(result) ? result[0] : result;
    return {
      mode,
      query,
      groups: [
        {
          provider: normalized.platform,
          providerName: providerRegistry.get(selectedProvider)?.name || selectedProvider,
          sourceType: mode,
          status: normalized.error ? "error" : "ok",
          error: normalized.error,
          resultCount: normalized.items.length,
          elapsedMs: normalized.elapsed,
          items: normalized.items.map((item, index) =>
            normalizeLibraryResultItem(mode, normalized.platform, item, index),
          ),
        },
      ],
      summary: {
        successCount: normalized.error ? 0 : 1,
        failureCount: normalized.error ? 1 : 0,
        totalResults: normalized.items.length,
      },
    };
  }

  private async searchPatent(
    query: string,
    providerId: string | undefined,
    commonOptions?: Record<string, unknown>,
  ): Promise<WorkspaceSearchResponse> {
    const selectedProvider = providerId || providerRegistry.getIdsByType("patent")[0];
    if (!selectedProvider) {
      throw new Error("No patent provider is available");
    }
    const extra = {
      patentType: asString(commonOptions?.patentType),
      legalStatus: asString(commonOptions?.legalStatus),
      database: asString(commonOptions?.database),
      sortField: asString(commonOptions?.sortField),
      sortOrder: asString(commonOptions?.sortOrder),
      rawQuery: asString(commonOptions?.rawQuery),
    };
    const result = await searchAction.executeBySourceType(query, "patent", selectedProvider, {
      maxResults: asNumber(commonOptions?.maxResults),
      sortBy: asString(commonOptions?.sortBy) as "relevance" | "date" | undefined,
      page: 1,
      extra,
    });
    const normalized = Array.isArray(result) ? result[0] : result;
    return {
      mode: "patent",
      query,
      groups: [
        {
          provider: normalized.platform,
          providerName: providerRegistry.get(selectedProvider)?.name || selectedProvider,
          sourceType: "patent",
          status: normalized.error ? "error" : "ok",
          error: normalized.error,
          resultCount: normalized.items.length,
          elapsedMs: normalized.elapsed,
          items: normalized.items.map((item, index) =>
            normalizeLibraryResultItem("patent", normalized.platform, item, index),
          ),
        },
      ],
      summary: {
        successCount: normalized.error ? 0 : 1,
        failureCount: normalized.error ? 1 : 0,
        totalResults: normalized.items.length,
      },
    };
  }

  private async searchWeb(request: {
    query: string;
    providers: string[];
    commonOptions?: Record<string, unknown>;
    providerOptions?: Record<string, WorkspaceWebProviderOptions | undefined>;
  }): Promise<WorkspaceSearchResponse> {
    const aggregateRequest: WorkspaceWebAggregateRequest = {
      query: request.query,
      providers: request.providers,
      commonOptions: {
        maxResults: asNumber(request.commonOptions?.maxResults),
        includeContent: request.commonOptions?.includeContent === true,
        includeDomains: splitLines(asString(request.commonOptions?.includeDomains)),
        excludeDomains: splitLines(asString(request.commonOptions?.excludeDomains)),
      },
      providerOptions: request.providerOptions,
    };

    const aggregated = await aggregateWebSearches({
      ...aggregateRequest,
      runProviderSearch: (provider, payload) => this.runWebProviderSearch(provider, payload),
    });

    return {
      mode: "web",
      query: request.query,
      groups: aggregated.groups.map((group) => ({
        provider: group.provider,
        providerName: webBackendRegistry.get(group.provider)?.name || group.provider,
        sourceType: "web",
        status: group.error ? "error" : "ok",
        error: group.error,
        answer: group.answer,
        resultCount: group.resultCount,
        elapsedMs: group.elapsedMs,
        request: group.request,
        items: group.results.map((item, index) =>
          normalizeWebResultItem(group.provider, item as unknown as Record<string, unknown>, index),
        ),
      })),
      summary: aggregated.summary,
    };
  }

  private async runWebProviderSearch(provider: string, payload: Record<string, unknown>) {
    const backend = webBackendRegistry.get(provider) as any;
    if (!backend) {
      throw new Error(`Web backend ${provider} is not loaded`);
    }
    if (!backend.isConfigured?.()) {
      throw new Error(`Web backend ${provider} is not configured`);
    }
    return backend.search(payload);
  }
}

function resolveLocale(localeInput?: string): "zh" | "en" {
  if (localeInput === "zh" || localeInput === "en") {
    return localeInput;
  }
  return String((Zotero as any)?.locale || "")
    .toLowerCase()
    .startsWith("zh")
    ? "zh"
    : "en";
}

function pickDefaultProvider(providers: WorkspaceProviderDescriptor[]): string {
  return (
    providers.find((provider) => provider.verified)?.id ||
    providers.find((provider) => provider.configured)?.id ||
    providers.find((provider) => provider.available)?.id ||
    providers[0]?.id ||
    ""
  );
}

function pickDefaultWebProviders(providers: WorkspaceProviderDescriptor[]): string[] {
  const selected = providers
    .filter((provider) => provider.verified || provider.configured || provider.available)
    .map((provider) => provider.id);
  return selected.length > 0 ? selected : providers.slice(0, 2).map((provider) => provider.id);
}

function normalizeLibraryResultItem(
  sourceType: "academic" | "patent",
  provider: string,
  item: ResourceItem,
  index: number,
): WorkspaceResultItem {
  return {
    id: `${provider}:${item.sourceId || item.DOI || item.url || index}`,
    title: item.title || "(untitled)",
    subtitle:
      item.publicationTitle || item.assignee || item.country || item.date || item.issueDate || "",
    snippet: item.abstractNote || item.extra || "",
    url: item.url,
    provider,
    sourceType,
    raw: item as unknown as Record<string, unknown>,
    resourceItem: item,
  };
}

function normalizeWebResultItem(
  provider: string,
  item: Record<string, unknown>,
  index: number,
): WorkspaceResultItem {
  const title = asString(item.title) || "(untitled)";
  const url = asString(item.url);
  const snippet = asString(item.snippet) || asString(item.content);
  const resourceItem: ResourceItem = {
    itemType: "webpage",
    title,
    url,
    abstractNote: snippet,
    date: asString(item.published_date) || asString(item.created_at),
    extra: asString(item.author),
    source: provider,
  };
  return {
    id: `${provider}:${url || index}`,
    title,
    subtitle: asString(item.author) || asString(item.published_date) || provider,
    snippet,
    url,
    provider,
    sourceType: "web",
    raw: item,
    resourceItem,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function splitLines(value: string): string[] | undefined {
  const parts = value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export const workspaceController = new WorkspaceController();
