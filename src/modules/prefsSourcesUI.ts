import { config } from "../../package.json";
import pkg from "../../package.json";
import { getString } from "../utils/locale";
import type { FluentMessageId } from "../../typings/i10n";
import { providerRegistry } from "../providers/registry";
import { getProviderStartupReport } from "../providers/loader";
import { PluggableSearchProvider } from "../providers/pluggable/PluggableSearchProvider";
import { webBackendRegistry } from "../providers/web/WebBackendRegistry";
import type { WebBackend, WebBackendConfigField } from "../providers/web/WebBackend";
import { secretStore } from "../infra/SecretStore";
import {
  createAcademicConfigSchema,
  normalizeProviderConfigFields,
  type NormalizedProviderConfigField,
} from "./providerConfigSchema";
import { getAcademicSourceGuidance } from "../providers/academicSourceGuidance";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function prefKey(full: string): string {
  return `${config.prefsPrefix}.${full}`;
}

function prefStr(fullKey: string, fallback: string): string {
  const v = Zotero.Prefs.get(prefKey(fullKey), true);
  if (v === undefined || v === null) {
    return fallback;
  }
  return String(v);
}

function prefBool(fullKey: string, fallback: boolean): boolean {
  const v = Zotero.Prefs.get(prefKey(fullKey), true);
  if (typeof v === "boolean") {
    return v;
  }
  return fallback;
}

function prefNum(fullKey: string, fallback: number): number {
  const v = Zotero.Prefs.get(prefKey(fullKey), true);
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function getLang(): "zh" | "en" {
  try {
    const locale = (Zotero as any).locale || "";
    return String(locale).toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

function createBlock(doc: Document, tag: string, text: string, style?: string): HTMLElement {
  const el = doc.createElementNS(HTML_NS, tag) as HTMLElement;
  el.textContent = text;
  if (style) {
    el.setAttribute("style", style);
  }
  return el;
}

function renderIssueList(
  doc: Document,
  title: string,
  items: string[],
  tone: "warn" | "info" = "warn",
): HTMLElement {
  const wrap = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  wrap.setAttribute(
    "style",
    tone === "warn"
      ? "border:1px solid #e6b85c;background:#fff8e1;border-radius:6px;padding:8px 10px;margin:8px 0"
      : "border:1px solid #b6d4fe;background:#f4f8ff;border-radius:6px;padding:8px 10px;margin:8px 0",
  );
  wrap.appendChild(createBlock(doc, "strong", title));
  const list = doc.createElementNS(HTML_NS, "ul") as HTMLElement;
  list.setAttribute("style", "margin:6px 0 0 18px;padding:0");
  for (const item of items) {
    const li = doc.createElementNS(HTML_NS, "li") as HTMLElement;
    li.textContent = item;
    li.setAttribute("style", "margin:4px 0");
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function renderAcademicField(
  doc: Document,
  parent: HTMLElement,
  providerId: string,
  field: NormalizedProviderConfigField,
  lang: "zh" | "en",
): void {
  const row = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  row.setAttribute("style", "display:flex;align-items:center;gap:8px;margin:4px 0;flex-wrap:wrap");

  const label = doc.createElementNS(HTML_NS, "label") as HTMLElement;
  label.setAttribute("style", "min-width:100px;font-size:0.88em");
  label.textContent = lang === "zh" && field.labelZh ? field.labelZh : field.label;

  const fullKey = prefKey(`platform.${providerId}.${field.key}`);
  const logicalKey = `platform.${providerId}.${field.key}`;
  if (field.secret) {
    secretStore.registerSecretKey(logicalKey);
  }

  if (field.control === "checkbox") {
    const checkbox = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
    checkbox.setAttribute("type", "checkbox");
    checkbox.checked = prefBool(`platform.${providerId}.${field.key}`, field.default === true);
    checkbox.addEventListener("change", () => {
      Zotero.Prefs.set(fullKey, checkbox.checked, true);
    });
    row.appendChild(label);
    row.appendChild(checkbox);
  } else if (field.control === "select") {
    const select = doc.createElementNS(HTML_NS, "select") as unknown as HTMLSelectElement;
    select.setAttribute("style", "max-width:220px;font-size:0.88em");
    for (const option of field.options ?? []) {
      const opt = doc.createElementNS(HTML_NS, "option") as unknown as HTMLOptionElement;
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    }
    const fallback = typeof field.default === "string" ? field.default : "";
    const current = prefStr(`platform.${providerId}.${field.key}`, fallback);
    select.value = current;
    select.addEventListener("change", () => {
      Zotero.Prefs.set(fullKey, select.value, true);
    });
    row.appendChild(label);
    row.appendChild(select);
  } else {
    const input = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
    input.setAttribute("type", field.control === "password" ? "password" : field.control);
    input.setAttribute("style", "flex:1;max-width:220px;font-size:0.88em");
    if (field.placeholder) {
      input.setAttribute("placeholder", field.placeholder);
    }
    if (field.min !== undefined) {
      input.min = String(field.min);
    }
    if (field.max !== undefined) {
      input.max = String(field.max);
    }
    if (field.control === "number") {
      const fallback = typeof field.default === "number" ? field.default : 0;
      input.value = String(prefNum(`platform.${providerId}.${field.key}`, fallback));
      input.addEventListener("change", () => {
        Zotero.Prefs.set(fullKey, parseInt(input.value, 10) || 0, true);
      });
    } else {
      const fallback = typeof field.default === "string" ? field.default : "";
      input.value = field.secret
        ? secretStore.getString(logicalKey, fallback)
        : prefStr(`platform.${providerId}.${field.key}`, fallback);
      input.addEventListener("change", () => {
        if (field.secret) {
          secretStore.setString(logicalKey, input.value);
        } else {
          Zotero.Prefs.set(fullKey, input.value, true);
        }
      });
    }
    row.appendChild(label);
    row.appendChild(input);
  }

  parent.appendChild(row);

  if (field.description) {
    const hint = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    hint.setAttribute("style", "margin:-2px 0 6px 108px;font-size:0.82em;color:#666");
    hint.textContent = field.description;
    parent.appendChild(hint);
  }
}

function renderAcademicCard(
  doc: Document,
  provider: PluggableSearchProvider,
  lang: "zh" | "en",
): HTMLElement {
  const wrap = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  wrap.setAttribute(
    "style",
    "border:1px solid #ddd;border-radius:6px;padding:8px 10px;margin-bottom:8px;background:#fafafa",
  );

  const normalizedFields = normalizeProviderConfigFields(
    createAcademicConfigSchema(provider.manifest),
  );
  const enabledField = normalizedFields.find((field) => field.key === "enabled");
  const detailFields = normalizedFields.filter((field) => field.key !== "enabled");
  const basicFields = detailFields.filter((field) => !field.advanced);
  const advancedFields = detailFields.filter((field) => field.advanced);
  const runtimeStatus = provider.getRuntimeStatus();
  const statusText = runtimeStatus.available
    ? lang === "zh"
      ? "可用"
      : "Ready"
    : !runtimeStatus.enabled
      ? lang === "zh"
        ? "已禁用"
        : "Disabled"
      : !runtimeStatus.configured
        ? lang === "zh"
          ? "缺少配置"
          : "Needs config"
        : lang === "zh"
          ? "已注册"
          : "Registered";
  const statusTone = runtimeStatus.available
    ? "background:#e8f7ee;color:#0f6b3d;border:1px solid #b7e2c4"
    : !runtimeStatus.enabled
      ? "background:#f3f4f6;color:#555;border:1px solid #dadde3"
      : !runtimeStatus.configured
        ? "background:#fff4e5;color:#a35a00;border:1px solid #f1d2a5"
        : "background:#eef4ff;color:#285ea8;border:1px solid #c9dafc";

  const header = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  header.setAttribute(
    "style",
    "display:flex;align-items:flex-start;justify-content:space-between;gap:8px",
  );

  const left = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  const title = doc.createElementNS(HTML_NS, "strong") as HTMLElement;
  title.textContent = provider.name;
  left.appendChild(title);

  const meta = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  meta.setAttribute("style", "font-size:0.82em;color:#666;margin-top:2px");
  meta.textContent = lang === "zh" ? "已安装 Provider" : "Installed provider";
  left.appendChild(meta);

  if (!runtimeStatus.configured && runtimeStatus.reason) {
    const warning = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    warning.setAttribute("style", "font-size:0.82em;color:#b45309;margin-top:2px");
    warning.textContent = runtimeStatus.reason;
    left.appendChild(warning);
  }

  header.appendChild(left);

  const right = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  right.setAttribute("style", "display:flex;align-items:center;gap:8px;flex-shrink:0");
  const badge = doc.createElementNS(HTML_NS, "span") as HTMLElement;
  badge.textContent = statusText;
  badge.setAttribute(
    "style",
    `${statusTone};display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.82em;white-space:nowrap`,
  );
  right.appendChild(badge);

  if (enabledField) {
    const toggle = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
    toggle.setAttribute("type", "checkbox");
    toggle.checked = prefBool(
      `platform.${provider.id}.enabled`,
      enabledField.default === true || enabledField.default === undefined,
    );
    toggle.addEventListener("change", () => {
      Zotero.Prefs.set(prefKey(`platform.${provider.id}.enabled`), toggle.checked, true);
    });
    right.appendChild(toggle);
  }
  header.appendChild(right);

  wrap.appendChild(header);

  const details = doc.createElementNS(HTML_NS, "details") as unknown as HTMLDetailsElement;
  details.open = false;
  details.setAttribute("style", "margin-top:6px");
  const summary = doc.createElementNS(HTML_NS, "summary") as HTMLElement;
  summary.textContent = lang === "zh" ? "展开配置" : "Show configuration";
  details.appendChild(summary);

  const body = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  body.setAttribute("style", "padding:6px 0 0 8px");
  for (const field of basicFields) {
    renderAcademicField(doc, body, provider.id, field, lang);
  }

  if (advancedFields.length) {
    const advanced = doc.createElementNS(HTML_NS, "details") as unknown as HTMLDetailsElement;
    advanced.setAttribute("style", "margin-top:4px");
    const advancedSummary = doc.createElementNS(HTML_NS, "summary") as HTMLElement;
    advancedSummary.textContent = lang === "zh" ? "高级" : "Advanced";
    advanced.appendChild(advancedSummary);

    const advancedBody = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    advancedBody.setAttribute("style", "padding:6px 0 0 8px");
    for (const field of advancedFields) {
      renderAcademicField(doc, advancedBody, provider.id, field, lang);
    }
    advanced.appendChild(advancedBody);
    body.appendChild(advanced);
  }

  details.appendChild(body);
  wrap.appendChild(details);

  return wrap;
}

/** Full Zotero preference name (extensions.zotero…). */
function fieldFullPref(backend: WebBackend, field: WebBackendConfigField): string {
  if (field.fullPrefKey) {
    return prefKey(field.fullPrefKey);
  }
  return prefKey(`web.${backend.id}.${field.key}`);
}

function readStrFull(fullPrefName: string, fallback: string): string {
  const v = Zotero.Prefs.get(fullPrefName, true);
  if (v === undefined || v === null) {
    return fallback;
  }
  return String(v);
}

function readBoolFull(fullPrefName: string, fallback: boolean): boolean {
  const v = Zotero.Prefs.get(fullPrefName, true);
  if (typeof v === "boolean") {
    return v;
  }
  return fallback;
}

function appendWebField(
  doc: Document,
  parent: HTMLElement,
  backend: WebBackend,
  field: WebBackendConfigField,
  lang: "zh" | "en",
): void {
  const row = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  row.setAttribute("style", "display:flex;align-items:center;gap:8px;margin:4px 0;flex-wrap:wrap");
  const lab = doc.createElementNS(HTML_NS, "label") as HTMLElement;
  lab.setAttribute("style", "min-width:100px;font-size:0.88em");
  lab.textContent = lang === "zh" && field.labelZh ? field.labelZh : field.label;
  const full = fieldFullPref(backend, field);
  const logicalKey = field.fullPrefKey || `web.${backend.id}.${field.key}`;
  if (field.type === "password") {
    secretStore.registerSecretKey(logicalKey);
  }

  if (field.type === "checkbox") {
    const cb = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
    cb.setAttribute("type", "checkbox");
    cb.checked = readBoolFull(full, false);
    cb.addEventListener("change", () => {
      Zotero.Prefs.set(full, cb.checked, true);
    });
    row.appendChild(lab);
    row.appendChild(cb);
    parent.appendChild(row);
    return;
  }

  if (field.type === "select" && field.options?.length) {
    const sel = doc.createElementNS(HTML_NS, "select") as unknown as HTMLSelectElement;
    sel.setAttribute("style", "max-width:220px;font-size:0.88em");
    for (const option of field.options) {
      const opt = doc.createElementNS(HTML_NS, "option") as unknown as HTMLOptionElement;
      opt.value = option.value;
      opt.textContent = option.label;
      sel.appendChild(opt);
    }
    const def = field.options[0]?.value ?? "";
    const cur = readStrFull(full, def);
    sel.value = field.options.some((option) => option.value === cur) ? cur : def;
    sel.addEventListener("change", () => {
      Zotero.Prefs.set(full, sel.value, true);
    });
    row.appendChild(lab);
    row.appendChild(sel);
    parent.appendChild(row);
    return;
  }

  const input = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
  input.setAttribute("type", field.type === "password" ? "password" : "text");
  input.setAttribute("style", "flex:1;max-width:320px;font-size:0.88em");
  if (field.placeholder) {
    input.setAttribute("placeholder", field.placeholder);
  }
  input.value = field.type === "password" ? secretStore.getString(logicalKey, "") : readStrFull(full, "");
  input.addEventListener("change", () => {
    if (field.type === "password") {
      secretStore.setString(logicalKey, input.value);
    } else {
      Zotero.Prefs.set(full, input.value, true);
    }
  });
  row.appendChild(lab);
  row.appendChild(input);
  parent.appendChild(row);
}

function setupStaticSecretInputs(doc: Document): void {
  const inputs = [...doc.querySelectorAll("input[preference]")] as HTMLInputElement[];
  for (const input of inputs) {
    const preference = input.getAttribute("preference");
    if (!preference || !preference.startsWith(`${config.prefsPrefix}.`)) continue;
    const logicalKey = preference.slice(config.prefsPrefix.length + 1);
    if (!secretStore.isSecretKey(logicalKey)) continue;

    secretStore.registerSecretKey(logicalKey);
    input.removeAttribute("preference");
    input.setAttribute("type", "password");
    input.value = secretStore.getString(logicalKey, "");
    input.addEventListener("change", () => {
      secretStore.setString(logicalKey, input.value);
    });
  }
}

function renderWebBackendCard(doc: Document, backend: WebBackend, lang: "zh" | "en"): HTMLElement {
  const wrap = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  wrap.setAttribute(
    "style",
    "border:1px solid #dde4f0;border-radius:6px;padding:8px 10px;margin-bottom:8px;background:#f8faff",
  );

  const header = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  header.setAttribute(
    "style",
    "display:flex;align-items:flex-start;justify-content:space-between;gap:8px",
  );

  const left = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  const titleRow = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  titleRow.setAttribute("style", "display:flex;align-items:center;gap:6px;flex-wrap:wrap");
  const title = doc.createElementNS(HTML_NS, "strong") as HTMLElement;
  title.textContent = backend.name;
  const status = doc.createElementNS(HTML_NS, "span") as HTMLElement;
  status.setAttribute("style", "font-size:0.85em");
  status.textContent = backend.isConfigured() ? "●" : "○";
  status.setAttribute("title", backend.isConfigured() ? "Ready" : "Not configured");
  const caps = doc.createElementNS(HTML_NS, "span") as HTMLElement;
  caps.setAttribute("style", "font-size:0.75em;color:#369");
  caps.textContent = [...backend.capabilities].join(" · ");
  titleRow.appendChild(title);
  titleRow.appendChild(status);
  titleRow.appendChild(caps);

  const desc = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  desc.setAttribute("style", "font-size:0.85em;color:#555;margin-top:2px");
  desc.textContent =
    lang === "zh" && backend.descriptionZh ? backend.descriptionZh : backend.description;
  left.appendChild(titleRow);
  left.appendChild(desc);

  const toggle = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
  toggle.setAttribute("type", "checkbox");
  toggle.checked = prefBool(`web.${backend.id}.enabled`, true);
  toggle.addEventListener("change", () => {
    Zotero.Prefs.set(prefKey(`web.${backend.id}.enabled`), toggle.checked, true);
  });

  header.appendChild(left);
  header.appendChild(toggle);
  wrap.appendChild(header);

  const basic = backend.configSchema.filter((field) => !field.advanced);
  const advanced = backend.configSchema.filter((field) => field.advanced);

  if (basic.length) {
    const details = doc.createElementNS(HTML_NS, "details") as unknown as HTMLDetailsElement;
    details.open = false;
    details.setAttribute("style", "margin-top:6px");
    const summary = doc.createElementNS(HTML_NS, "summary") as HTMLElement;
    summary.textContent = lang === "zh" ? "展开配置" : "Show configuration";
    details.appendChild(summary);
    const box = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    box.setAttribute("style", "padding:6px 0 0 8px");
    for (const field of basic) {
      appendWebField(doc, box, backend, field, lang);
    }
    details.appendChild(box);
    wrap.appendChild(details);
  }

  if (advanced.length) {
    const details = doc.createElementNS(HTML_NS, "details") as unknown as HTMLDetailsElement;
    details.setAttribute("style", "margin-top:4px");
    const summary = doc.createElementNS(HTML_NS, "summary") as HTMLElement;
    summary.textContent = lang === "zh" ? "高级" : "Advanced";
    details.appendChild(summary);
    const box = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    box.setAttribute("style", "padding:6px 0 0 8px");
    for (const field of advanced) {
      appendWebField(doc, box, backend, field, lang);
    }
    details.appendChild(box);
    wrap.appendChild(details);
  }

  return wrap;
}

export function setupPrefsSourcesUI(win: Window): void {
  const doc = win.document;

  const tabIds = ["zrs-tab-general", "zrs-tab-sources", "zrs-tab-manage"] as const;
  const tabKeys: FluentMessageId[] = ["pref-tab-general", "pref-tab-sources", "pref-tab-manage"];
  for (let i = 0; i < tabIds.length; i++) {
    const el = doc.getElementById(tabIds[i]);
    if (el) {
      try {
        el.setAttribute("label", getString(tabKeys[i]));
      } catch {
        /* keep default label from XHTML */
      }
    }
  }

  const logo = doc.getElementById("zrs-pref-logo") as HTMLImageElement | null;
  const versionEl = doc.getElementById("zrs-pref-version");
  try {
    if (logo) {
      logo.src = `${rootURI}content/icons/icon96.png`;
    }
  } catch {
    /* ignore */
  }
  try {
    if (versionEl) {
      versionEl.textContent = `v${pkg.version}`;
    }
  } catch {
    /* ignore */
  }

  const container = doc.getElementById("zrs-sources-container");
  if (!container) {
    return;
  }

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const lang = getLang();
  const report = getProviderStartupReport();
  setupStaticSecretInputs(doc);
  const guidance = getAcademicSourceGuidance({
    locale: lang,
    academicProviderCount: report.academic.length,
    registryUrl: prefStr("providers.registryUrl", ""),
  });
  const academicProviders = providerRegistry
    .getAll()
    .filter(
      (provider): provider is PluggableSearchProvider =>
        provider instanceof PluggableSearchProvider,
    )
    .filter((provider) => provider.sourceType === "academic")
    .sort((a, b) => {
      const statusA = a.getRuntimeStatus();
      const statusB = b.getRuntimeStatus();
      if (statusA.available !== statusB.available) return statusA.available ? -1 : 1;
      if (statusA.enabled !== statusB.enabled) return statusA.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const patentProviders = providerRegistry
    .getAll()
    .filter(
      (provider): provider is PluggableSearchProvider =>
        provider instanceof PluggableSearchProvider,
    )
    .filter((provider) => provider.sourceType === "patent")
    .sort((a, b) => {
      const statusA = a.getRuntimeStatus();
      const statusB = b.getRuntimeStatus();
      if (statusA.available !== statusB.available) return statusA.available ? -1 : 1;
      if (statusA.enabled !== statusB.enabled) return statusA.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  if (guidance.needsAttention) {
    container.appendChild(renderIssueList(doc, guidance.title, guidance.details, "info"));
  }

  container.appendChild(
    createBlock(
      doc,
      "h3",
      lang === "zh" ? "学术搜索源" : "Academic sources",
      "margin:0 0 6px 0;font-size:1.05em",
    ),
  );
  container.appendChild(
    createBlock(
      doc,
      "p",
      lang === "zh"
        ? "学术源通过外部 provider 包提供。可在 Manage 页配置源仓库 URL、检查仓库更新，或直接导入 zip。"
        : "Academic sources come from external provider packages. Use the Manage tab to set a provider repository URL, check the registry, or import a zip.",
      "color:#666;font-size:0.85em;margin:0 0 8px 0",
    ),
  );
  container.appendChild(
    createBlock(
      doc,
      "p",
      lang === "zh"
        ? `当前已加载 ${report.academic.length} 个学术源，其中 ${report.academic.filter((entry) => entry.available).length} 个可直接使用。卡片默认折叠，按需展开配置。`
        : `${report.academic.length} academic providers are loaded, and ${report.academic.filter((entry) => entry.available).length} are ready. Cards are collapsed by default to save space.`,
      "color:#4b5563;font-size:0.82em;margin:0 0 10px 0",
    ),
  );

  const academicIssues = [
    ...report.issues,
    ...report.academic.filter((entry) => entry.error).map((entry) => `${entry.id}: ${entry.error}`),
  ];
  if (academicIssues.length) {
    container.appendChild(
      renderIssueList(
        doc,
        lang === "zh" ? "Provider 启动/加载异常" : "Provider startup / load issues",
        academicIssues,
      ),
    );
  }

  if (academicProviders.length === 0) {
    container.appendChild(
      renderIssueList(
        doc,
        lang === "zh"
          ? "当前没有已加载的学术源"
          : "No academic sources are currently loaded",
        [
          lang === "zh"
            ? "请到 Manage 页填写源仓库 URL 后点击“检查仓库更新”，或直接导入 provider zip。"
            : 'Open the Manage tab, set a provider repository URL, then click "Check registry" or import a provider zip.',
        ],
        "info",
      ),
    );
  } else {
    for (const provider of academicProviders) {
      container.appendChild(renderAcademicCard(doc, provider, lang));
    }
  }

  container.appendChild(
    createBlock(
      doc,
      "h3",
      lang === "zh" ? "专利搜索源" : "Patent sources",
      "margin:16px 0 6px 0;font-size:1.05em",
    ),
  );
  container.appendChild(
    createBlock(
      doc,
      "p",
      lang === "zh"
        ? "专利源同样通过外部 provider 包提供；返回的结果会标准化为可直接写入 Zotero patent 的条目。"
        : "Patent sources also come from external provider packages and return normalized items that can be written into Zotero patent entries.",
      "color:#666;font-size:0.85em;margin:0 0 8px 0",
    ),
  );
  container.appendChild(
    createBlock(
      doc,
      "p",
      lang === "zh"
        ? `当前已加载 ${report.patent.length} 个专利源，其中 ${report.patent.filter((entry) => entry.available).length} 个可直接使用。`
        : `${report.patent.length} patent providers are loaded, and ${report.patent.filter((entry) => entry.available).length} are ready.`,
      "color:#4b5563;font-size:0.82em;margin:0 0 10px 0",
    ),
  );

  const patentIssues = report.patent
    .filter((entry) => entry.error)
    .map((entry) => `${entry.id}: ${entry.error}`);
  if (patentIssues.length) {
    container.appendChild(
      renderIssueList(
        doc,
        lang === "zh" ? "Patent provider 启动/加载异常" : "Patent provider startup / load issues",
        patentIssues,
      ),
    );
  }

  if (patentProviders.length === 0) {
    container.appendChild(
      renderIssueList(
        doc,
        lang === "zh" ? "当前没有已加载的专利源" : "No patent sources are currently loaded",
        [
          lang === "zh"
            ? "请到 Manage 页填写源仓库 URL 后点击“检查仓库更新”，或直接导入 provider zip。"
            : 'Open the Manage tab, set a provider repository URL, then click "Check registry" or import a provider zip.',
        ],
        "info",
      ),
    );
  } else {
    for (const provider of patentProviders) {
      container.appendChild(renderAcademicCard(doc, provider, lang));
    }
  }

  container.appendChild(
    createBlock(
      doc,
      "h3",
      lang === "zh" ? "网页搜索后端" : "Web backends",
      "margin:16px 0 6px 0;font-size:1.05em",
    ),
  );
  container.appendChild(
    createBlock(
      doc,
      "p",
      lang === "zh"
        ? "启用并配置各后端；路由器会自动选择可用提供商。"
        : "Enable and configure backends; the router picks an available provider.",
      "color:#666;font-size:0.85em;margin:0 0 8px 0",
    ),
  );

  const webIssues = report.web
    .filter((entry) => entry.error)
    .map((entry) => `${entry.id}: ${entry.error}`);
  if (webIssues.length) {
    container.appendChild(
      renderIssueList(doc, lang === "zh" ? "Web backend 异常" : "Web backend issues", webIssues),
    );
  }

  for (const backend of webBackendRegistry
    .getAll()
    .sort((a, b) => Number(b.isConfigured()) - Number(a.isConfigured()) || a.name.localeCompare(b.name))) {
    container.appendChild(renderWebBackendCard(doc, backend, lang));
  }

  const note = doc.createElementNS(HTML_NS, "p") as HTMLElement;
  note.setAttribute("data-l10n-id", "pref-sources-ext-note");
  note.setAttribute("style", "color:#888;font-size:0.82em;margin-top:10px");
  container.appendChild(note);
}
