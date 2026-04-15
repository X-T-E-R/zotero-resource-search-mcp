import type { ResourceItem } from "../models/types";

declare const document: Document;
declare const window: Window & { arguments?: any[]; opener?: any };

type WorkspaceMode = "academic" | "patent" | "web";

interface ProviderDescriptor {
  id: string;
  name: string;
  sourceType: WorkspaceMode;
  description: string;
  configured: boolean;
  available: boolean;
  verified: boolean;
  status: { kind: string; text: string; tone: string };
  helpSummary: string;
  helpNotes: string[];
  capabilities?: string[];
}

interface WorkspaceBootstrapData {
  locale: "zh" | "en";
  general: { fetchPDF: boolean; maxResults: number };
  collections: Array<{ key: string; name: string; path: string; itemCount: number }>;
  providers: {
    academic: ProviderDescriptor[];
    patent: ProviderDescriptor[];
    web: ProviderDescriptor[];
  };
  defaults: {
    academicProvider: string;
    patentProvider: string;
    webProviders: string[];
  };
  help: {
    overview: {
      quickstart: string[];
      note: string;
    };
  };
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

interface WorkspaceSearchResponse {
  mode: WorkspaceMode;
  query: string;
  groups: WorkspaceResultGroup[];
  summary: {
    successCount: number;
    failureCount: number;
    totalResults: number;
  };
}

interface WorkspaceBridge {
  getBootstrapData(locale?: string): Promise<WorkspaceBootstrapData>;
  getProviderHelp(providerId?: string, locale?: string): any;
  search(request: Record<string, unknown>): Promise<WorkspaceSearchResponse>;
  addResult(request: {
    item?: ResourceItem;
    url?: string;
    collectionKey?: string;
    tags?: string[];
    fetchPDF?: boolean;
  }): Promise<any>;
  focusItem(itemKey: string): boolean;
}

interface SavedSearchPreset {
  id: string;
  label: string;
  mode: WorkspaceMode;
  query: string;
  state: Partial<WorkspaceUIState>;
}

interface WorkspaceUIState {
  mode: WorkspaceMode;
  queryByMode: Record<WorkspaceMode, string>;
  providerByMode: Record<"academic" | "patent", string>;
  webProviders: string[];
  webProviderOptions: Record<string, Record<string, unknown>>;
  academicOptions: Record<string, unknown>;
  patentOptions: Record<string, unknown>;
  webOptions: Record<string, unknown>;
  selectedCollectionKey: string;
  fetchPDF: boolean;
  tagsInput: string;
  recent: SavedSearchPreset[];
  favorites: SavedSearchPreset[];
  helpScope: "provider" | "overall";
  helpProviderId: string;
}

const STORAGE_KEY = "zrs-workspace-state-v1";
const root = document.getElementById("workspace-root") as HTMLDivElement | null;
const fallbackStorage = new Map<string, string>();

const runtime = {
  bridge: null as WorkspaceBridge | null,
  bootstrap: null as WorkspaceBootstrapData | null,
  state: null as WorkspaceUIState | null,
  results: null as WorkspaceSearchResponse | null,
  selectedResultId: "",
  addedState: new Map<string, { key?: string; title?: string; message?: string }>(),
  busy: false,
  message: "",
};

if (root) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initialize());
  } else {
    void initialize();
  }
}

async function initialize(): Promise<void> {
  if (!root) {
    return;
  }
  try {
    const bridge = resolveBridge();
    if (!bridge) {
      root.innerHTML =
        '<div class="ws-card ws-section ws-error">Workspace bridge is unavailable. Re-open this window from Zotero.</div>';
      return;
    }
    runtime.bridge = bridge;
    runtime.bootstrap = await bridge.getBootstrapData();
    runtime.state = loadState(runtime.bootstrap);
    render();
  } catch (error) {
    renderFatalError(error);
  }
}

function resolveBridge(): WorkspaceBridge | null {
  const candidate =
    ((window as any).arguments?.[0] as any)?.api?.workspace ||
    ((window.opener as any)?.ZoteroResourceSearch as any)?.api?.workspace ||
    ((window.opener as any)?.Zotero?.ZoteroResourceSearch as any)?.api?.workspace ||
    ((window.opener as any)?.addon as any)?.api?.workspace;
  return candidate ?? null;
}

function loadState(bootstrap: WorkspaceBootstrapData): WorkspaceUIState {
  const saved = safeParse(readStoredState());
  return {
    mode: isMode(saved?.mode) ? saved.mode : "academic",
    queryByMode: {
      academic: asString(saved?.queryByMode?.academic),
      patent: asString(saved?.queryByMode?.patent),
      web: asString(saved?.queryByMode?.web),
    },
    providerByMode: {
      academic: asString(saved?.providerByMode?.academic) || bootstrap.defaults.academicProvider,
      patent: asString(saved?.providerByMode?.patent) || bootstrap.defaults.patentProvider,
    },
    webProviders: withFallbackProviders(
      sanitizeProviderIds(saved?.webProviders, bootstrap.providers.web),
      bootstrap.defaults.webProviders,
    ),
    webProviderOptions: {
      tavily: {
        topic: "general",
        includeAnswer: true,
        ...(saved?.webProviderOptions?.tavily || {}),
      },
      firecrawl: { categories: "research", ...(saved?.webProviderOptions?.firecrawl || {}) },
      exa: { ...(saved?.webProviderOptions?.exa || {}) },
      xai: {
        sources: "web",
        allowedXHandles: "",
        excludedXHandles: "",
        fromDate: "",
        toDate: "",
        ...(saved?.webProviderOptions?.xai || {}),
      },
      mysearch: { ...(saved?.webProviderOptions?.mysearch || {}) },
    },
    academicOptions: {
      maxResults: bootstrap.general.maxResults,
      sortBy: "relevance",
      year: "",
      author: "",
      ...(saved?.academicOptions || {}),
    },
    patentOptions: {
      maxResults: bootstrap.general.maxResults,
      sortBy: "relevance",
      patentType: "all",
      legalStatus: "all",
      database: "CN",
      sortField: "applicationDate",
      sortOrder: "desc",
      rawQuery: "",
      ...(saved?.patentOptions || {}),
    },
    webOptions: {
      maxResults: bootstrap.general.maxResults,
      includeContent: false,
      includeDomains: "",
      excludeDomains: "",
      ...(saved?.webOptions || {}),
    },
    selectedCollectionKey:
      asString(saved?.selectedCollectionKey) || bootstrap.collections[0]?.key || "",
    fetchPDF: typeof saved?.fetchPDF === "boolean" ? saved.fetchPDF : bootstrap.general.fetchPDF,
    tagsInput: asString(saved?.tagsInput),
    recent: Array.isArray(saved?.recent) ? saved.recent.slice(0, 6) : [],
    favorites: Array.isArray(saved?.favorites) ? saved.favorites.slice(0, 6) : [],
    helpScope: saved?.helpScope === "overall" ? "overall" : "provider",
    helpProviderId: asString(saved?.helpProviderId),
  };
}

function render(): void {
  if (!root || !runtime.bootstrap || !runtime.state) {
    return;
  }
  const state = runtime.state;
  const bootstrap = runtime.bootstrap;
  const modeProviders = getProvidersForMode(state.mode);
  const currentQuery = state.queryByMode[state.mode];
  const selectedProviderId = getCurrentProviderId();
  const helpProviderId = state.helpProviderId || selectedProviderId;
  const activeResult = findSelectedResult();
  const results = runtime.results;

  document.title =
    bootstrap.locale === "zh" ? "Resource Search 工作台" : "Resource Search Workspace";

  root.innerHTML = `
    <div class="ws-shell">
      <aside class="ws-panel ws-sidebar">
        <div class="ws-scroll">
          <section class="ws-section">
            <h1 class="ws-title">${bootstrap.locale === "zh" ? "搜索工作台" : "Search Workspace"}</h1>
            <p class="ws-subtitle">${
              bootstrap.locale === "zh"
                ? "在一个独立窗口里选择 provider、搜索、预览并直接写入 Zotero。"
                : "Choose providers, search, preview, and insert results into Zotero in one window."
            }</p>
          </section>
          <section class="ws-section">
            <div class="ws-chip-row" id="ws-mode-switch"></div>
          </section>
          <section class="ws-section">
            <div class="ws-toolbar">
              <h2 class="ws-title" style="font-size:1rem">${bootstrap.locale === "zh" ? "Provider 选择" : "Provider Selection"}</h2>
            </div>
            <div class="ws-provider-list" id="ws-provider-list"></div>
          </section>
          <section class="ws-section">
            <h2 class="ws-title" style="font-size:1rem">${bootstrap.locale === "zh" ? "参数面板" : "Parameters"}</h2>
            <div class="ws-field-grid" id="ws-params"></div>
          </section>
          <section class="ws-section">
            <h2 class="ws-title" style="font-size:1rem">${bootstrap.locale === "zh" ? "工作台工具" : "Workspace Tools"}</h2>
            <div class="ws-field-grid">
              <div class="ws-field">
                <label>${bootstrap.locale === "zh" ? "目标集合" : "Target Collection"}</label>
                <select id="ws-collection-select"></select>
              </div>
              <div class="ws-field">
                <label>${bootstrap.locale === "zh" ? "默认标签（逗号分隔）" : "Default Tags (comma separated)"}</label>
                <input id="ws-tags-input" value="${escapeAttr(state.tagsInput)}" />
              </div>
            </div>
            <div class="ws-inline-row" style="margin-top:10px">
              <label class="ws-chip"><input id="ws-fetch-pdf" type="checkbox" ${
                state.fetchPDF ? "checked" : ""
              } /> ${bootstrap.locale === "zh" ? "添加时尝试抓 PDF" : "Fetch PDF when adding"}</label>
              <button class="ws-btn" id="ws-save-favorite">${
                bootstrap.locale === "zh" ? "收藏当前搜索" : "Save Favorite"
              }</button>
            </div>
            <div class="ws-stack" style="margin-top:12px">
              <div>
                <div class="ws-muted" style="margin-bottom:6px">${
                  bootstrap.locale === "zh" ? "最近搜索" : "Recent Searches"
                }</div>
                <div class="ws-list-buttons" id="ws-recent-list"></div>
              </div>
              <div>
                <div class="ws-muted" style="margin-bottom:6px">${
                  bootstrap.locale === "zh" ? "收藏搜索" : "Favorite Searches"
                }</div>
                <div class="ws-list-buttons" id="ws-favorite-list"></div>
              </div>
            </div>
          </section>
          <section class="ws-section">
            <div class="ws-toolbar">
              <h2 class="ws-title" style="font-size:1rem">Provider Help</h2>
              <div class="ws-chip-row">
                <button class="ws-chip ${state.helpScope === "provider" ? "is-active" : ""}" id="ws-help-provider">${
                  bootstrap.locale === "zh" ? "当前源" : "Current"
                }</button>
                <button class="ws-chip ${state.helpScope === "overall" ? "is-active" : ""}" id="ws-help-overall">${
                  bootstrap.locale === "zh" ? "整体" : "Overall"
                }</button>
              </div>
            </div>
            <div id="ws-help-panel"></div>
          </section>
        </div>
      </aside>
      <main class="ws-main">
        <section class="ws-card ws-section">
          <div class="ws-searchbar">
            <input id="ws-query-input" value="${escapeAttr(currentQuery)}" placeholder="${
              bootstrap.locale === "zh" ? "输入检索词" : "Search query"
            }" />
            <button class="ws-btn ws-btn-accent" id="ws-run-search" ${canSearch() ? "" : "disabled"}>${
              runtime.busy
                ? bootstrap.locale === "zh"
                  ? "搜索中..."
                  : "Searching..."
                : bootstrap.locale === "zh"
                  ? "搜索"
                  : "Search"
            }</button>
            <button class="ws-btn" id="ws-clear-results">${
              bootstrap.locale === "zh" ? "清空结果" : "Clear"
            }</button>
          </div>
          <p class="ws-subtitle" id="ws-search-summary">${
            runtime.message ||
            (results
              ? formatSummary(results, bootstrap.locale)
              : bootstrap.locale === "zh"
                ? "选择模式和 provider 后开始搜索。"
                : "Choose a mode and providers to begin.")
          }</p>
        </section>
        <section class="ws-card ws-section ws-scroll" style="flex:1">
          <div class="ws-results" id="ws-results"></div>
        </section>
      </main>
      <aside class="ws-panel ws-detail">
        <div class="ws-scroll">
          <section class="ws-section">
            <h2 class="ws-title" style="font-size:1rem">${bootstrap.locale === "zh" ? "详情预览" : "Detail Preview"}</h2>
            <div id="ws-detail-panel"></div>
          </section>
          <section class="ws-section">
            <h2 class="ws-title" style="font-size:1rem">${bootstrap.locale === "zh" ? "插入 Zotero" : "Add to Zotero"}</h2>
            <div id="ws-add-panel"></div>
          </section>
        </div>
      </aside>
    </div>
  `;

  renderModeSwitch();
  renderProviderList(modeProviders, selectedProviderId);
  renderParamPanel();
  renderCollections();
  renderSavedSearches();
  renderHelp(helpProviderId);
  renderResults();
  renderDetail(activeResult);
  bindChrome();
}

function renderModeSwitch(): void {
  const container = document.getElementById("ws-mode-switch");
  if (!container || !runtime.bootstrap || !runtime.state) return;
  const labels: Record<WorkspaceMode, string> =
    runtime.bootstrap.locale === "zh"
      ? { academic: "学术", patent: "专利", web: "网页" }
      : { academic: "Academic", patent: "Patent", web: "Web" };
  container.innerHTML = "";
  (["academic", "patent", "web"] as WorkspaceMode[]).forEach((mode) => {
    const button = document.createElement("button");
    button.className = `ws-chip ${runtime.state!.mode === mode ? "is-active" : ""}`;
    button.textContent = labels[mode];
    button.addEventListener("click", () => {
      runtime.state!.mode = mode;
      runtime.state!.helpProviderId = getCurrentProviderId();
      persistState();
      render();
    });
    container.appendChild(button);
  });
}

function renderProviderList(providers: ProviderDescriptor[], selectedProviderId: string): void {
  const container = document.getElementById("ws-provider-list");
  if (!container || !runtime.bootstrap || !runtime.state) return;
  container.innerHTML = "";
  if (providers.length === 0) {
    container.innerHTML = `<div class="ws-empty">${
      runtime.bootstrap.locale === "zh"
        ? "当前模式没有可用 provider。"
        : "No providers available for this mode."
    }</div>`;
    return;
  }

  providers.forEach((provider, index) => {
    const item = document.createElement("div");
    item.className = "ws-provider-item";
    const checked =
      runtime.state!.mode === "web"
        ? runtime.state!.webProviders.includes(provider.id)
        : selectedProviderId === provider.id;
    const top = document.createElement("div");
    top.className = "ws-provider-top";

    const selector = document.createElement("input");
    selector.type = runtime.state!.mode === "web" ? "checkbox" : "radio";
    selector.name = "ws-provider";
    selector.checked = checked;

    const main = document.createElement("div");
    main.className = "ws-provider-main";

    const name = document.createElement("div");
    name.className = "ws-provider-name";
    name.textContent = provider.name;

    const desc = document.createElement("div");
    desc.className = "ws-provider-desc";
    desc.textContent = provider.description;

    const badge = document.createElement("span");
    badge.className = "ws-badge";
    badge.setAttribute("style", provider.status.tone);
    badge.textContent = provider.status.text;

    main.appendChild(name);
    main.appendChild(desc);
    top.appendChild(selector);
    top.appendChild(main);
    top.appendChild(badge);
    item.appendChild(top);

    const actions = document.createElement("div");
    actions.className = "ws-inline-row";
    actions.style.marginTop = "8px";

    const helpBtn = document.createElement("button");
    helpBtn.className = "ws-mini-btn";
    helpBtn.textContent = runtime.bootstrap!.locale === "zh" ? "查看帮助" : "Help";
    actions.appendChild(helpBtn);

    let upBtn: HTMLButtonElement | null = null;
    let downBtn: HTMLButtonElement | null = null;
    if (runtime.state!.mode === "web") {
      upBtn = document.createElement("button");
      upBtn.className = "ws-mini-btn";
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;

      downBtn = document.createElement("button");
      downBtn.className = "ws-mini-btn";
      downBtn.textContent = "↓";
      downBtn.disabled = index === providers.length - 1;

      actions.appendChild(upBtn);
      actions.appendChild(downBtn);
    }
    item.appendChild(actions);

    selector.addEventListener("change", () => {
      if (runtime.state!.mode === "web") {
        toggleWebProvider(provider.id, selector.checked);
      } else {
        runtime.state!.providerByMode[runtime.state!.mode as "academic" | "patent"] = provider.id;
      }
      runtime.state!.helpProviderId = provider.id;
      persistState();
      render();
    });

    helpBtn.addEventListener("click", () => {
      runtime.state!.helpScope = "provider";
      runtime.state!.helpProviderId = provider.id;
      persistState();
      renderHelp(provider.id);
    });

    upBtn?.addEventListener("click", () => moveWebProvider(provider.id, -1));
    downBtn?.addEventListener("click", () => moveWebProvider(provider.id, 1));

    container.appendChild(item);
  });
}

function renderParamPanel(): void {
  const container = document.getElementById("ws-params") as HTMLElement | null;
  if (!container || !runtime.bootstrap || !runtime.state) return;
  const locale = runtime.bootstrap.locale;
  const state = runtime.state;
  container.innerHTML = "";

  if (state.mode === "academic") {
    appendField(
      container,
      locale === "zh" ? "结果数" : "Max Results",
      "number",
      state.academicOptions.maxResults,
      (value) => {
        state.academicOptions.maxResults = value;
        persistState();
      },
    );
    appendSelect(
      container,
      locale === "zh" ? "排序" : "Sort By",
      [
        ["relevance", locale === "zh" ? "相关性" : "Relevance"],
        ["date", locale === "zh" ? "日期" : "Date"],
        ["citations", locale === "zh" ? "引用" : "Citations"],
      ],
      String(state.academicOptions.sortBy || "relevance"),
      (value) => {
        state.academicOptions.sortBy = value;
        persistState();
      },
    );
    appendField(
      container,
      locale === "zh" ? "年份 / 范围" : "Year / Range",
      "text",
      state.academicOptions.year,
      (value) => {
        state.academicOptions.year = value;
        persistState();
      },
    );
    appendField(
      container,
      locale === "zh" ? "作者" : "Author",
      "text",
      state.academicOptions.author,
      (value) => {
        state.academicOptions.author = value;
        persistState();
      },
    );
    return;
  }

  if (state.mode === "patent") {
    appendField(
      container,
      locale === "zh" ? "结果数" : "Max Results",
      "number",
      state.patentOptions.maxResults,
      (value) => {
        state.patentOptions.maxResults = value;
        persistState();
      },
    );
    appendSelect(
      container,
      locale === "zh" ? "排序" : "Sort By",
      [
        ["relevance", locale === "zh" ? "相关性" : "Relevance"],
        ["date", locale === "zh" ? "日期" : "Date"],
      ],
      String(state.patentOptions.sortBy || "relevance"),
      (value) => {
        state.patentOptions.sortBy = value;
        persistState();
      },
    );
    appendSelect(
      container,
      locale === "zh" ? "专利类型" : "Patent Type",
      [
        ["all", locale === "zh" ? "全部" : "All"],
        ["invention", locale === "zh" ? "发明" : "Invention"],
        ["utility_model", locale === "zh" ? "实用新型" : "Utility Model"],
        ["design", locale === "zh" ? "外观" : "Design"],
      ],
      String(state.patentOptions.patentType || "all"),
      (value) => {
        state.patentOptions.patentType = value;
        persistState();
      },
    );
    appendSelect(
      container,
      locale === "zh" ? "法律状态" : "Legal Status",
      [
        ["all", locale === "zh" ? "全部" : "All"],
        ["valid", locale === "zh" ? "有效" : "Valid"],
        ["invalid", locale === "zh" ? "无效" : "Invalid"],
        ["pending", locale === "zh" ? "审中" : "Pending"],
      ],
      String(state.patentOptions.legalStatus || "all"),
      (value) => {
        state.patentOptions.legalStatus = value;
        persistState();
      },
    );
    appendSelect(
      container,
      locale === "zh" ? "数据库" : "Database",
      [
        ["CN", locale === "zh" ? "中国专利" : "China Patents"],
        ["WD", locale === "zh" ? "世界专利" : "World Patents"],
      ],
      String(state.patentOptions.database || "CN"),
      (value) => {
        state.patentOptions.database = value;
        persistState();
      },
    );
    appendField(
      container,
      locale === "zh" ? "高级检索式" : "Expert Query",
      "textarea",
      state.patentOptions.rawQuery,
      (value) => {
        state.patentOptions.rawQuery = value;
        persistState();
      },
    );
    return;
  }

  appendField(
    container,
    locale === "zh" ? "结果数" : "Max Results",
    "number",
    state.webOptions.maxResults,
    (value) => {
      state.webOptions.maxResults = value;
      persistState();
    },
  );
  appendCheckbox(
    container,
    locale === "zh" ? "抓取正文内容" : "Include Full Content",
    state.webOptions.includeContent === true,
    (checked) => {
      state.webOptions.includeContent = checked;
      persistState();
    },
  );
  appendField(
    container,
    locale === "zh" ? "包含域名" : "Include Domains",
    "textarea",
    state.webOptions.includeDomains,
    (value) => {
      state.webOptions.includeDomains = value;
      persistState();
    },
  );
  appendField(
    container,
    locale === "zh" ? "排除域名" : "Exclude Domains",
    "textarea",
    state.webOptions.excludeDomains,
    (value) => {
      state.webOptions.excludeDomains = value;
      persistState();
    },
  );

  state.webProviders.forEach((providerId) => {
    const providerBlock = document.createElement("div") as HTMLDivElement;
    providerBlock.className = "ws-provider-item";
    const provider = runtime.bootstrap!.providers.web.find((entry) => entry.id === providerId);
    providerBlock.innerHTML = `<div class="ws-provider-name">${escapeHtml(provider?.name || providerId)}</div>`;
    container.appendChild(providerBlock);
    const options =
      state.webProviderOptions[providerId] || (state.webProviderOptions[providerId] = {});
    if (providerId === "tavily") {
      appendSelect(
        providerBlock,
        "Topic",
        [
          ["general", "General"],
          ["news", "News"],
        ],
        String(options.topic || "general"),
        (value) => {
          options.topic = value;
          persistState();
        },
      );
      appendCheckbox(
        providerBlock,
        "Include Answer",
        options.includeAnswer !== false,
        (checked) => {
          options.includeAnswer = checked;
          persistState();
        },
      );
    } else if (providerId === "firecrawl") {
      appendField(
        providerBlock,
        "Categories",
        "text",
        String(options.categories || "research"),
        (value) => {
          options.categories = value;
          persistState();
        },
      );
    } else if (providerId === "xai") {
      appendField(providerBlock, "Sources", "text", String(options.sources || "web"), (value) => {
        options.sources = value;
        persistState();
      });
      appendField(
        providerBlock,
        "Allowed X Handles",
        "text",
        String(options.allowedXHandles || ""),
        (value) => {
          options.allowedXHandles = value;
          persistState();
        },
      );
      appendField(
        providerBlock,
        "Excluded X Handles",
        "text",
        String(options.excludedXHandles || ""),
        (value) => {
          options.excludedXHandles = value;
          persistState();
        },
      );
      appendField(providerBlock, "From Date", "text", String(options.fromDate || ""), (value) => {
        options.fromDate = value;
        persistState();
      });
      appendField(providerBlock, "To Date", "text", String(options.toDate || ""), (value) => {
        options.toDate = value;
        persistState();
      });
    } else {
      const note = document.createElement("div");
      note.className = "ws-help-note";
      note.textContent =
        runtime.bootstrap!.locale === "zh"
          ? "该后端没有额外参数。"
          : "No extra parameters for this backend.";
      providerBlock.appendChild(note);
    }
  });
}

function renderCollections(): void {
  const select = document.getElementById("ws-collection-select") as HTMLSelectElement | null;
  if (!select || !runtime.bootstrap || !runtime.state) return;
  const current = runtime.state.selectedCollectionKey;
  select.innerHTML = `<option value="">${
    runtime.bootstrap.locale === "zh" ? "根库 / 未指定" : "Root Library / Unspecified"
  }</option>`;
  runtime.bootstrap.collections.forEach((collection) => {
    const option = document.createElement("option");
    option.value = collection.key;
    option.textContent = collection.path;
    option.selected = current === collection.key;
    select.appendChild(option);
  });
}

function renderSavedSearches(): void {
  renderPresetList("ws-recent-list", runtime.state?.recent || []);
  renderPresetList("ws-favorite-list", runtime.state?.favorites || [], true);
}

function renderPresetList(id: string, presets: SavedSearchPreset[], removable = false): void {
  const container = document.getElementById(id);
  if (!container || !runtime.bootstrap || !runtime.state) return;
  container.innerHTML = "";
  if (presets.length === 0) {
    container.innerHTML = `<span class="ws-muted">${
      runtime.bootstrap.locale === "zh" ? "暂无" : "None yet"
    }</span>`;
    return;
  }
  presets.forEach((preset) => {
    const wrap = document.createElement("span");
    wrap.className = "ws-inline-row";

    const button = document.createElement("button");
    button.className = "ws-mini-btn";
    button.textContent = preset.label;
    button.addEventListener("click", () => {
      applyPreset(preset);
      render();
    });
    wrap.appendChild(button);

    if (removable) {
      const remove = document.createElement("button");
      remove.className = "ws-mini-btn";
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        runtime.state!.favorites = runtime.state!.favorites.filter(
          (entry) => entry.id !== preset.id,
        );
        persistState();
        renderSavedSearches();
      });
      wrap.appendChild(remove);
    }
    container.appendChild(wrap);
  });
}

function renderHelp(providerId: string): void {
  const container = document.getElementById("ws-help-panel");
  if (!container || !runtime.bootstrap || !runtime.state || !runtime.bridge) return;
  if (runtime.state.helpScope === "overall") {
    const overview = runtime.bootstrap.help.overview;
    container.innerHTML = `
      <p class="ws-subtitle">${escapeHtml(overview.note)}</p>
      <div class="ws-stack" style="margin-top:10px">
        ${overview.quickstart
          .map(
            (line) =>
              `<div class="ws-kv"><strong>Quickstart</strong><div>${escapeHtml(line)}</div></div>`,
          )
          .join("")}
      </div>
    `;
    return;
  }
  const snapshot = runtime.bridge.getProviderHelp(providerId, runtime.bootstrap.locale);
  const provider = snapshot.providers?.[0];
  if (!provider) {
    container.innerHTML = `<div class="ws-empty">${
      runtime.bootstrap.locale === "zh"
        ? "当前 provider 没有帮助信息。"
        : "No help available for the current provider."
    }</div>`;
    return;
  }
  container.innerHTML = `
    <div class="ws-kv">
      <strong>${escapeHtml(provider.name)}</strong>
      <div>${escapeHtml(provider.summary)}</div>
    </div>
    <div class="ws-stack" style="margin-top:10px">
      ${(provider.notes || [])
        .map((note: string) => `<div class="ws-kv"><div>${escapeHtml(note)}</div></div>`)
        .join("")}
    </div>
  `;
}

function renderResults(): void {
  const container = document.getElementById("ws-results");
  if (!container || !runtime.bootstrap) return;
  const results = runtime.results;
  if (!results) {
    container.innerHTML = `<div class="ws-empty">${
      runtime.bootstrap.locale === "zh"
        ? "搜索结果会显示在这里。"
        : "Search results will appear here."
    }</div>`;
    return;
  }

  container.innerHTML = "";
  results.groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "ws-card ws-group";
    section.innerHTML = `
      <div class="ws-group-head">
        <div>
          <div class="ws-result-title">${escapeHtml(group.providerName)}</div>
          <div class="ws-group-meta">${escapeHtml(group.provider)} · ${group.resultCount} ${
            runtime.bootstrap!.locale === "zh" ? "条结果" : "results"
          }${group.elapsedMs ? ` · ${group.elapsedMs}ms` : ""}</div>
        </div>
        ${group.error ? `<div class="ws-error">${escapeHtml(group.error)}</div>` : ""}
      </div>
      ${
        group.answer
          ? `<div class="ws-kv" style="margin-bottom:10px"><strong>Answer</strong><div>${escapeHtml(group.answer)}</div></div>`
          : ""
      }
      <div class="ws-result-list"></div>
    `;
    const list = section.querySelector(".ws-result-list") as HTMLDivElement;
    if (group.items.length === 0 && !group.error) {
      list.innerHTML = `<div class="ws-empty">${
        runtime.bootstrap!.locale === "zh" ? "没有结果。" : "No results."
      }</div>`;
    }
    group.items.forEach((item) => {
      const resultEl = document.createElement("article");
      resultEl.className = `ws-result-item ${runtime.selectedResultId === item.id ? "is-selected" : ""}`;
      const added = runtime.addedState.get(item.id);
      resultEl.innerHTML = `
        <div class="ws-result-title">${escapeHtml(item.title)}</div>
        <div class="ws-result-subtitle">${escapeHtml(item.subtitle || item.provider)}</div>
        <div class="ws-result-snippet">${escapeHtml(item.snippet || "")}</div>
        <div class="ws-result-actions">
          <div class="ws-inline-row">
            <button class="ws-btn" data-preview="1">${
              runtime.bootstrap!.locale === "zh" ? "预览" : "Preview"
            }</button>
            ${
              item.url
                ? `<a class="ws-link" href="${escapeAttr(item.url)}" target="_blank">${
                    runtime.bootstrap!.locale === "zh" ? "打开链接" : "Open Link"
                  }</a>`
                : ""
            }
          </div>
          <div class="ws-inline-row">
            ${
              added?.key
                ? `<button class="ws-btn" data-locate="1">${
                    runtime.bootstrap!.locale === "zh" ? "定位条目" : "Locate Item"
                  }</button>`
                : ""
            }
            <button class="ws-btn ws-btn-primary" data-quick-add="1">${
              added?.key
                ? runtime.bootstrap!.locale === "zh"
                  ? "已加入"
                  : "Added"
                : runtime.bootstrap!.locale === "zh"
                  ? "快速加入"
                  : "Quick Add"
            }</button>
          </div>
        </div>
        ${added?.message ? `<div class="ws-muted" style="margin-top:8px">${escapeHtml(added.message)}</div>` : ""}
      `;
      (resultEl.querySelector("[data-preview='1']") as HTMLButtonElement).addEventListener(
        "click",
        () => {
          runtime.selectedResultId = item.id;
          render();
        },
      );
      (resultEl.querySelector("[data-quick-add='1']") as HTMLButtonElement).addEventListener(
        "click",
        () => void quickAdd(item),
      );
      const locateBtn = resultEl.querySelector("[data-locate='1']") as HTMLButtonElement | null;
      locateBtn?.addEventListener("click", () => {
        const key = runtime.addedState.get(item.id)?.key;
        if (key) {
          runtime.bridge?.focusItem(key);
        }
      });
      list.appendChild(resultEl);
    });
    container.appendChild(section);
  });
}

function renderDetail(item: WorkspaceResultItem | null): void {
  const detailPanel = document.getElementById("ws-detail-panel");
  const addPanel = document.getElementById("ws-add-panel");
  if (!detailPanel || !addPanel || !runtime.bootstrap || !runtime.state) return;

  if (!item) {
    detailPanel.innerHTML = `<div class="ws-empty">${
      runtime.bootstrap.locale === "zh"
        ? "选择一条结果后查看详情。"
        : "Select a result to inspect details."
    }</div>`;
    addPanel.innerHTML = `<div class="ws-empty">${
      runtime.bootstrap.locale === "zh"
        ? "选择结果后可在这里高级加入。"
        : "Select a result to use advanced add."
    }</div>`;
    return;
  }

  const fields = Object.entries(item.raw || {})
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .slice(0, 10);
  detailPanel.innerHTML = `
    <div class="ws-stack">
      <div class="ws-kv">
        <strong>${escapeHtml(item.title)}</strong>
        <div>${escapeHtml(item.subtitle)}</div>
      </div>
      ${
        item.snippet
          ? `<div class="ws-kv"><strong>${runtime.bootstrap.locale === "zh" ? "摘要" : "Snippet"}</strong><div>${escapeHtml(item.snippet)}</div></div>`
          : ""
      }
      ${
        item.url
          ? `<div class="ws-kv"><strong>URL</strong><a class="ws-link" href="${escapeAttr(item.url)}" target="_blank">${escapeHtml(item.url)}</a></div>`
          : ""
      }
      <div class="ws-detail-fields">
        ${fields
          .map(
            ([key, value]) =>
              `<div class="ws-kv"><strong>${escapeHtml(key)}</strong><div>${escapeHtml(formatValue(value))}</div></div>`,
          )
          .join("")}
      </div>
    </div>
  `;

  addPanel.innerHTML = `
    <div class="ws-field-grid">
      <div class="ws-field">
        <label>${runtime.bootstrap.locale === "zh" ? "目标集合" : "Target Collection"}</label>
        <select id="ws-detail-collection"></select>
      </div>
      <div class="ws-field">
        <label>${runtime.bootstrap.locale === "zh" ? "标签" : "Tags"}</label>
        <input id="ws-detail-tags" value="${escapeAttr(runtime.state.tagsInput)}" />
      </div>
    </div>
    <div class="ws-inline-row" style="margin-top:12px">
      <button class="ws-btn ws-btn-accent" id="ws-detail-add">${
        runtime.bootstrap.locale === "zh" ? "高级加入" : "Advanced Add"
      }</button>
      ${
        runtime.addedState.get(item.id)?.key
          ? `<button class="ws-btn" id="ws-detail-locate">${
              runtime.bootstrap.locale === "zh" ? "定位已加入条目" : "Locate Added Item"
            }</button>`
          : ""
      }
    </div>
    ${
      runtime.addedState.get(item.id)?.message
        ? `<div class="ws-muted" style="margin-top:10px">${escapeHtml(runtime.addedState.get(item.id)!.message || "")}</div>`
        : ""
    }
  `;

  const select = document.getElementById("ws-detail-collection") as HTMLSelectElement | null;
  const sourceSelect = document.getElementById("ws-collection-select") as HTMLSelectElement | null;
  if (!select || !sourceSelect) {
    return;
  }
  select.innerHTML = sourceSelect.innerHTML;
  select.value = runtime.state.selectedCollectionKey;
  select.addEventListener("change", () => {
    runtime.state!.selectedCollectionKey = select.value;
    persistState();
    renderCollections();
  });

  const tags = document.getElementById("ws-detail-tags") as HTMLInputElement | null;
  const addButton = document.getElementById("ws-detail-add") as HTMLButtonElement | null;
  if (!tags || !addButton) {
    return;
  }
  tags.addEventListener("input", () => {
    runtime.state!.tagsInput = tags.value;
    persistState();
  });

  addButton.addEventListener("click", () => void advancedAdd(item, tags.value, select.value));
  (document.getElementById("ws-detail-locate") as HTMLButtonElement | null)?.addEventListener(
    "click",
    () => {
      const key = runtime.addedState.get(item.id)?.key;
      if (key) {
        runtime.bridge?.focusItem(key);
      }
    },
  );
}

function bindChrome(): void {
  if (!runtime.bootstrap || !runtime.state) return;
  const queryInput = document.getElementById("ws-query-input") as HTMLInputElement | null;
  const runSearchButton = document.getElementById("ws-run-search") as HTMLButtonElement | null;
  const clearResultsButton = document.getElementById("ws-clear-results") as HTMLButtonElement | null;
  const collectionSelect = document.getElementById("ws-collection-select") as HTMLSelectElement | null;
  const tagsInput = document.getElementById("ws-tags-input") as HTMLInputElement | null;
  const fetchPdfInput = document.getElementById("ws-fetch-pdf") as HTMLInputElement | null;
  const saveFavoriteButton = document.getElementById("ws-save-favorite") as HTMLButtonElement | null;
  const helpProviderButton = document.getElementById("ws-help-provider") as HTMLButtonElement | null;
  const helpOverallButton = document.getElementById("ws-help-overall") as HTMLButtonElement | null;

  if (
    !queryInput ||
    !runSearchButton ||
    !clearResultsButton ||
    !collectionSelect ||
    !tagsInput ||
    !fetchPdfInput ||
    !saveFavoriteButton ||
    !helpProviderButton ||
    !helpOverallButton
  ) {
    return;
  }

  queryInput.addEventListener("input", (event) => {
    runtime.state!.queryByMode[runtime.state!.mode] = (event.target as HTMLInputElement).value;
    persistState();
  });
  runSearchButton.addEventListener("click", () => void runSearch());
  clearResultsButton.addEventListener("click", () => {
    runtime.results = null;
    runtime.selectedResultId = "";
    runtime.message = "";
    render();
  });
  collectionSelect.addEventListener("change", (event) => {
    runtime.state!.selectedCollectionKey = (event.target as HTMLSelectElement).value;
    persistState();
  });
  tagsInput.addEventListener("input", (event) => {
    runtime.state!.tagsInput = (event.target as HTMLInputElement).value;
    persistState();
  });
  fetchPdfInput.addEventListener("change", (event) => {
    runtime.state!.fetchPDF = (event.target as HTMLInputElement).checked;
    persistState();
  });
  saveFavoriteButton.addEventListener("click", () => {
    saveFavorite();
    renderSavedSearches();
  });
  helpProviderButton.addEventListener("click", () => {
    runtime.state!.helpScope = "provider";
    persistState();
    renderHelp(runtime.state!.helpProviderId || getCurrentProviderId());
  });
  helpOverallButton.addEventListener("click", () => {
    runtime.state!.helpScope = "overall";
    persistState();
    render();
  });
}

async function runSearch(): Promise<void> {
  if (!runtime.bridge || !runtime.state) return;
  runtime.busy = true;
  runtime.message = runtime.bootstrap?.locale === "zh" ? "正在搜索..." : "Searching...";
  render();
  try {
    const response = await runtime.bridge.search(buildSearchPayload());
    runtime.results = response;
    runtime.selectedResultId = response.groups.flatMap((group) => group.items)[0]?.id || "";
    runtime.message = formatSummary(response, runtime.bootstrap!.locale);
    pushRecent();
  } catch (error) {
    runtime.message = error instanceof Error ? error.message : String(error);
  } finally {
    runtime.busy = false;
    persistState();
    render();
  }
}

async function quickAdd(item: WorkspaceResultItem): Promise<void> {
  if (!runtime.bridge || !runtime.state) return;
  const result = await runtime.bridge.addResult({
    item: item.resourceItem,
    url: item.resourceItem ? undefined : item.url,
    collectionKey: runtime.state.selectedCollectionKey || undefined,
    tags: parseTags(runtime.state.tagsInput),
    fetchPDF: runtime.state.fetchPDF,
  });
  runtime.addedState.set(item.id, result);
  render();
}

async function advancedAdd(
  item: WorkspaceResultItem,
  tagsInput: string,
  collectionKey: string,
): Promise<void> {
  if (!runtime.bridge || !runtime.state) return;
  const result = await runtime.bridge.addResult({
    item: item.resourceItem,
    url: item.resourceItem ? undefined : item.url,
    collectionKey: collectionKey || undefined,
    tags: parseTags(tagsInput),
    fetchPDF: runtime.state.fetchPDF,
  });
  runtime.addedState.set(item.id, result);
  render();
}

function buildSearchPayload(): Record<string, unknown> {
  const state = runtime.state!;
  const query = state.queryByMode[state.mode];
  if (state.mode === "academic") {
    return {
      mode: "academic",
      query,
      provider: state.providerByMode.academic,
      commonOptions: state.academicOptions,
    };
  }
  if (state.mode === "patent") {
    return {
      mode: "patent",
      query,
      provider: state.providerByMode.patent,
      commonOptions: state.patentOptions,
    };
  }

  const providerOptions: Record<string, Record<string, unknown>> = {};
  state.webProviders.forEach((providerId) => {
    const rawOptions = state.webProviderOptions[providerId] || {};
    providerOptions[providerId] = {
      ...rawOptions,
      sources:
        providerId === "xai" ? splitInlineList(String(rawOptions.sources || "web")) : undefined,
      allowedXHandles:
        providerId === "xai"
          ? splitInlineList(String(rawOptions.allowedXHandles || ""))
          : undefined,
      excludedXHandles:
        providerId === "xai"
          ? splitInlineList(String(rawOptions.excludedXHandles || ""))
          : undefined,
    };
  });
  return {
    mode: "web",
    query,
    providers: state.webProviders,
    commonOptions: state.webOptions,
    providerOptions,
  };
}

function canSearch(): boolean {
  if (!runtime.state) return false;
  const query = runtime.state.queryByMode[runtime.state.mode].trim();
  if (!query) return false;
  if (runtime.state.mode === "web") return runtime.state.webProviders.length > 0;
  return !!getCurrentProviderId();
}

function getCurrentProviderId(): string {
  if (!runtime.state) return "";
  if (runtime.state.mode === "web") {
    return runtime.state.helpProviderId || runtime.state.webProviders[0] || "";
  }
  return runtime.state.providerByMode[runtime.state.mode as "academic" | "patent"] || "";
}

function getProvidersForMode(mode: WorkspaceMode): ProviderDescriptor[] {
  if (!runtime.bootstrap) return [];
  if (mode !== "web" || !runtime.state) {
    return runtime.bootstrap.providers[mode];
  }
  const selectedOrder = new Map(runtime.state.webProviders.map((id, index) => [id, index]));
  return [...runtime.bootstrap.providers.web].sort((a, b) => {
    const aIndex = selectedOrder.has(a.id) ? selectedOrder.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bIndex = selectedOrder.has(b.id) ? selectedOrder.get(b.id)! : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.name.localeCompare(b.name);
  });
}

function findSelectedResult(): WorkspaceResultItem | null {
  if (!runtime.results) return null;
  return (
    runtime.results.groups
      .flatMap((group) => group.items)
      .find((item) => item.id === runtime.selectedResultId) || null
  );
}

function toggleWebProvider(providerId: string, checked: boolean): void {
  if (!runtime.state) return;
  const current = [...runtime.state.webProviders];
  const has = current.includes(providerId);
  if (checked && !has) {
    current.push(providerId);
  }
  if (!checked && has) {
    runtime.state.webProviders = current.filter((id) => id !== providerId);
    return;
  }
  runtime.state.webProviders = current;
}

function moveWebProvider(providerId: string, delta: number): void {
  if (!runtime.state) return;
  const list = [...runtime.state.webProviders];
  const index = list.indexOf(providerId);
  if (index === -1) return;
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
  runtime.state.webProviders = list;
  persistState();
  render();
}

function pushRecent(): void {
  if (!runtime.state) return;
  const preset = snapshotPreset();
  runtime.state.recent = [
    preset,
    ...runtime.state.recent.filter((entry) => entry.id !== preset.id),
  ].slice(0, 6);
}

function saveFavorite(): void {
  if (!runtime.state) return;
  const preset = snapshotPreset();
  runtime.state.favorites = [
    preset,
    ...runtime.state.favorites.filter((entry) => entry.id !== preset.id),
  ].slice(0, 6);
  persistState();
}

function snapshotPreset(): SavedSearchPreset {
  const state = runtime.state!;
  const query = state.queryByMode[state.mode];
  return {
    id: `${state.mode}:${query}`,
    label: query || (runtime.bootstrap!.locale === "zh" ? "未命名搜索" : "Untitled Search"),
    mode: state.mode,
    query,
    state: {
      mode: state.mode,
      queryByMode: state.queryByMode,
      providerByMode: state.providerByMode,
      webProviders: state.webProviders,
      academicOptions: state.academicOptions,
      patentOptions: state.patentOptions,
      webOptions: state.webOptions,
      webProviderOptions: state.webProviderOptions,
    },
  };
}

function applyPreset(preset: SavedSearchPreset): void {
  if (!runtime.state) return;
  const nextState = preset.state || {};
  runtime.state.mode = preset.mode;
  runtime.state.queryByMode = {
    ...runtime.state.queryByMode,
    ...(nextState.queryByMode || {}),
    [preset.mode]: preset.query,
  };
  runtime.state.providerByMode = {
    ...runtime.state.providerByMode,
    ...(nextState.providerByMode || {}),
  };
  runtime.state.webProviders = withFallbackProviders(
    sanitizeProviderIds(nextState.webProviders, runtime.bootstrap!.providers.web),
    runtime.state.webProviders,
  );
  runtime.state.academicOptions = {
    ...runtime.state.academicOptions,
    ...(nextState.academicOptions || {}),
  };
  runtime.state.patentOptions = {
    ...runtime.state.patentOptions,
    ...(nextState.patentOptions || {}),
  };
  runtime.state.webOptions = { ...runtime.state.webOptions, ...(nextState.webOptions || {}) };
  runtime.state.webProviderOptions = {
    ...runtime.state.webProviderOptions,
    ...(nextState.webProviderOptions || {}),
  };
  persistState();
}

function persistState(): void {
  if (!runtime.state) return;
  writeStoredState(JSON.stringify(runtime.state));
}

function readStoredState(): string | null {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) ?? fallbackStorage.get(STORAGE_KEY) ?? null;
  } catch {
    return fallbackStorage.get(STORAGE_KEY) ?? null;
  }
}

function writeStoredState(value: string): void {
  fallbackStorage.set(STORAGE_KEY, value);
  try {
    window.localStorage?.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore Gecko storage restrictions in chrome dialogs */
  }
}

function renderFatalError(error: unknown): void {
  if (!root) return;
  const message =
    error instanceof Error ? error.message || String(error) : String(error || "Unknown error");
  root.innerHTML = `
    <div class="ws-shell">
      <main class="ws-main">
        <section class="ws-card ws-section ws-error">
          <h1 class="ws-title">Workspace failed to initialize</h1>
          <p class="ws-subtitle">The Resource Search workspace crashed during startup.</p>
          <pre class="ws-code-block">${escapeHtml(message)}</pre>
        </section>
      </main>
    </div>
  `;
}

function appendField(
  container: HTMLElement,
  label: string,
  type: "text" | "number" | "textarea",
  value: unknown,
  onChange: (value: string | number) => void,
): void {
  const field = document.createElement("div");
  field.className = "ws-field";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  field.appendChild(labelEl);

  const input =
    type === "textarea"
      ? (document.createElement("textarea") as HTMLTextAreaElement)
      : (document.createElement("input") as HTMLInputElement);
  if (type !== "textarea") {
    (input as HTMLInputElement).type = type;
  }
  input.value = String(value ?? "");
  input.addEventListener("input", () => {
    onChange(type === "number" ? Number(input.value || 0) : input.value);
  });
  field.appendChild(input);
  container.appendChild(field);
}

function appendSelect(
  container: HTMLElement,
  label: string,
  options: Array<[string, string]>,
  value: string,
  onChange: (value: string) => void,
): void {
  const field = document.createElement("div");
  field.className = "ws-field";
  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  const select = document.createElement("select");
  field.appendChild(labelEl);
  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.appendChild(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  field.appendChild(select);
  container.appendChild(field);
}

function appendCheckbox(
  container: HTMLElement,
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): void {
  const wrap = document.createElement("label");
  wrap.className = "ws-chip";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  wrap.appendChild(input);
  wrap.append(` ${label}`);
  input.addEventListener("change", () => onChange(input.checked));
  container.appendChild(wrap);
}

function parseTags(input: string): string[] | undefined {
  const tags = input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function splitInlineList(input: string): string[] | undefined {
  const items = input
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function sanitizeProviderIds(value: unknown, providers: ProviderDescriptor[]): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(providers.map((provider) => provider.id));
  return value.filter((entry) => typeof entry === "string" && allowed.has(entry));
}

function withFallbackProviders(current: string[], fallback: string[]): string[] {
  return current.length > 0 ? current : fallback;
}

function safeParse(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isMode(value: unknown): value is WorkspaceMode {
  return value === "academic" || value === "patent" || value === "web";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function formatSummary(result: WorkspaceSearchResponse, locale: "zh" | "en"): string {
  return locale === "zh"
    ? `本次查询共返回 ${result.summary.totalResults} 条结果，成功 ${result.summary.successCount} 组，失败 ${result.summary.failureCount} 组。`
    : `This search returned ${result.summary.totalResults} results across ${result.summary.successCount} successful groups and ${result.summary.failureCount} failed groups.`;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatValue(entry)).join(", ");
  }
  if (typeof value === "object" && value) {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
