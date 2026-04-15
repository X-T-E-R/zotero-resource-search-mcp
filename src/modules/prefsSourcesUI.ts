import { config } from "../../package.json";
import pkg from "../../package.json";
import type { FluentMessageId } from "../../typings/i10n";
import { secretStore } from "../infra/SecretStore";
import { getAcademicSourceGuidance } from "../providers/academicSourceGuidance";
import { getProviderStartupReport } from "../providers/loader";
import { PluggableSearchProvider } from "../providers/pluggable/PluggableSearchProvider";
import { providerRegistry } from "../providers/registry";
import {
  clearSourceVerified,
  getRequiredPlatformConfigKeys,
  getRequiredWebConfigKeys,
  getSourceProbeQuery,
  getSourceVerifiedState,
  isPlatformConfigured,
  isWebConfigured,
  type ProbeSourceType,
  type SourceScope,
} from "../providers/sourcePrefs";
import { probeSource } from "../providers/sourceProbe";
import type { WebBackend, WebBackendConfigField } from "../providers/web/WebBackend";
import { webBackendRegistry } from "../providers/web/WebBackendRegistry";
import { getString } from "../utils/locale";
import { resolveWorkspaceSourceStatus } from "../workspace/sourceStatus";
import {
  createAcademicConfigSchema,
  normalizeProviderConfigFields,
  type NormalizedProviderConfigField,
} from "./providerConfigSchema";

const HTML_NS = "http://www.w3.org/1999/xhtml";

interface CardModel {
  scope: SourceScope;
  sourceType: ProbeSourceType;
  id: string;
  name: string;
  description: string;
  fields: NormalizedProviderConfigField[];
  requiredKeys: string[];
  sourceLabel: string;
}

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

function createWebFields(backend: WebBackend): NormalizedProviderConfigField[] {
  const mapped = backend.configSchema.map((field) => normalizeWebField(field));
  return [
    {
      key: "enabled",
      control: "checkbox",
      type: "boolean",
      default: true,
      label: "Enabled",
      labelZh: "启用",
      advanced: false,
    },
    {
      key: "maxResults",
      control: "number",
      type: "number",
      default: 0,
      min: -1,
      max: 100,
      label: "Max Results",
      labelZh: "结果数",
      advanced: true,
      description:
        "0 = use global default, -1 = use this backend maximum, positive numbers override both.",
    },
    {
      key: "probeQuery",
      control: "text",
      type: "string",
      default: "",
      label: "Probe Query",
      labelZh: "测活查询",
      advanced: true,
      description: "Optional override for this backend's health check search query.",
    },
    ...mapped,
  ];
}

function normalizeWebField(field: WebBackendConfigField): NormalizedProviderConfigField {
  return {
    key: field.key,
    control: field.type,
    type: field.type === "checkbox" ? "boolean" : field.type === "select" ? "string" : "string",
    default: field.type === "checkbox" ? false : "",
    label: field.label,
    labelZh: field.labelZh,
    advanced: field.advanced === true,
    placeholder: field.placeholder,
    options: field.options,
  };
}

function readFieldValue(
  model: CardModel,
  field: NormalizedProviderConfigField,
): string | number | boolean {
  const logicalKey = `${model.scope}.${model.id}.${field.key}`;
  if (field.control === "checkbox") {
    return prefBool(logicalKey, field.default === true);
  }
  if (field.control === "number") {
    return prefNum(logicalKey, typeof field.default === "number" ? field.default : 0);
  }
  if (field.control === "password") {
    return secretStore.getString(
      logicalKey,
      typeof field.default === "string" ? field.default : "",
    );
  }
  return prefStr(logicalKey, typeof field.default === "string" ? field.default : "");
}

function writeFieldValue(
  model: CardModel,
  field: NormalizedProviderConfigField,
  value: string | number | boolean,
): void {
  const logicalKey = `${model.scope}.${model.id}.${field.key}`;
  const fullKey = prefKey(logicalKey);
  if (field.control === "checkbox") {
    Zotero.Prefs.set(fullKey, Boolean(value), true);
    return;
  }
  if (field.control === "number") {
    Zotero.Prefs.set(fullKey, Number(value) || 0, true);
    return;
  }
  if (field.control === "password") {
    secretStore.setString(logicalKey, String(value));
    return;
  }
  Zotero.Prefs.set(fullKey, String(value), true);
}

function getResultsHint(lang: "zh" | "en"): string {
  return lang === "zh"
    ? "0 = 使用通用默认值；-1 = 使用当前源最大值；正数 = 显式覆盖。"
    : "0 = use global default; -1 = use this source maximum; positive numbers override both.";
}

function getMissingConfigText(lang: "zh" | "en", requiredKeys: string[]): string {
  if (requiredKeys.length === 0) {
    return lang === "zh" ? "请补充配置后再测活。" : "Complete the configuration before probing.";
  }
  return lang === "zh"
    ? `请填写必填项：${requiredKeys.join(" / ")}。`
    : `Fill the required fields: ${requiredKeys.join(" / ")}.`;
}

function formatVerifiedInfo(
  lang: "zh" | "en",
  state: { verifiedAt: string; verifiedQuery: string } | null,
): string {
  if (!state) {
    return "";
  }
  const formatted = new Date(state.verifiedAt).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
  if (lang === "zh") {
    return state.verifiedQuery
      ? `已于 ${formatted} 使用“${state.verifiedQuery}”确认可用。`
      : `已于 ${formatted} 确认可用。`;
  }
  return state.verifiedQuery
    ? `Verified at ${formatted} with "${state.verifiedQuery}".`
    : `Verified at ${formatted}.`;
}

function shouldInvalidateVerification(fieldKey: string): boolean {
  return !["defaultSort", "maxResults", "probeQuery"].includes(fieldKey);
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

function renderField(
  doc: Document,
  body: HTMLElement,
  model: CardModel,
  field: NormalizedProviderConfigField,
  draft: Record<string, unknown>,
  lang: "zh" | "en",
  onMutation: (fieldKey: string) => void,
): void {
  const row = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  row.setAttribute("style", "display:flex;align-items:center;gap:8px;margin:4px 0;flex-wrap:wrap");

  const label = doc.createElementNS(HTML_NS, "label") as HTMLElement;
  label.setAttribute("style", "min-width:112px;font-size:0.88em");
  label.textContent = lang === "zh" && field.labelZh ? field.labelZh : field.label;

  if (field.key === "maxResults") {
    const tip = doc.createElementNS(HTML_NS, "span") as HTMLElement;
    tip.textContent = "?";
    tip.setAttribute(
      "style",
      "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:999px;border:1px solid #cbd5e1;color:#475569;font-size:0.78em;cursor:help",
    );
    tip.setAttribute("title", getResultsHint(lang));
    label.appendChild(doc.createTextNode(" "));
    label.appendChild(tip);
  }

  const logicalKey = `${model.scope}.${model.id}.${field.key}`;
  draft[logicalKey] = readFieldValue(model, field);

  if (field.control === "checkbox") {
    const checkbox = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
    checkbox.setAttribute("type", "checkbox");
    checkbox.checked = Boolean(draft[logicalKey]);
    checkbox.addEventListener("change", () => {
      draft[logicalKey] = checkbox.checked;
      writeFieldValue(model, field, checkbox.checked);
      onMutation(field.key);
    });
    row.appendChild(label);
    row.appendChild(checkbox);
    body.appendChild(row);
    return;
  }

  if (field.control === "select") {
    const select = doc.createElementNS(HTML_NS, "select") as unknown as HTMLSelectElement;
    select.setAttribute("style", "max-width:220px;font-size:0.88em");
    for (const option of field.options ?? []) {
      const opt = doc.createElementNS(HTML_NS, "option") as unknown as HTMLOptionElement;
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    }
    select.value = String(draft[logicalKey] ?? "");
    select.addEventListener("change", () => {
      draft[logicalKey] = select.value;
      writeFieldValue(model, field, select.value);
      onMutation(field.key);
    });
    row.appendChild(label);
    row.appendChild(select);
    body.appendChild(row);
    return;
  }

  const input = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
  input.setAttribute("type", field.control === "password" ? "password" : field.control);
  input.setAttribute("style", "flex:1;max-width:280px;font-size:0.88em");
  if (field.placeholder) {
    input.setAttribute("placeholder", field.placeholder);
  }
  if (field.min !== undefined) {
    input.min = String(field.min);
  }
  if (field.max !== undefined) {
    input.max = String(field.max);
  }
  input.value = String(draft[logicalKey] ?? "");
  if (field.control === "number") {
    input.addEventListener("input", () => {
      draft[logicalKey] = input.value;
    });
    input.addEventListener("change", () => {
      const parsed = parseInt(input.value, 10);
      const value = Number.isFinite(parsed) ? parsed : 0;
      draft[logicalKey] = value;
      input.value = String(value);
      writeFieldValue(model, field, value);
      onMutation(field.key);
    });
  } else {
    const applyTextValue = () => {
      draft[logicalKey] = input.value;
      writeFieldValue(model, field, input.value);
      onMutation(field.key);
    };
    input.addEventListener("input", applyTextValue);
    input.addEventListener("change", applyTextValue);
  }

  row.appendChild(label);
  row.appendChild(input);
  body.appendChild(row);

  if (field.description && field.key !== "maxResults") {
    const hint = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    hint.setAttribute("style", "margin:-2px 0 6px 120px;font-size:0.82em;color:#666");
    hint.textContent = field.description;
    body.appendChild(hint);
  }
}

function renderCard(doc: Document, model: CardModel, lang: "zh" | "en"): HTMLElement {
  const wrap = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  wrap.setAttribute(
    "style",
    model.scope === "web"
      ? "border:1px solid #dde4f0;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#f8faff"
      : "border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#fafafa",
  );

  const draft: Record<string, unknown> = {};
  const enabledField = model.fields.find((field) => field.key === "enabled");
  const detailFields = model.fields.filter((field) => field.key !== "enabled");
  const basicFields = detailFields.filter((field) => !field.advanced);
  const advancedFields = detailFields.filter((field) => field.advanced);
  const enabledKey = `${model.scope}.${model.id}.enabled`;
  draft[enabledKey] = enabledField ? readFieldValue(model, enabledField) : true;

  const header = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  header.setAttribute(
    "style",
    "display:flex;align-items:flex-start;justify-content:space-between;gap:10px",
  );

  const left = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  const title = doc.createElementNS(HTML_NS, "strong") as HTMLElement;
  title.textContent = model.name;
  left.appendChild(title);

  const meta = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  meta.setAttribute("style", "font-size:0.82em;color:#666;margin-top:2px");
  meta.textContent = model.sourceLabel;
  left.appendChild(meta);

  const desc = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  desc.setAttribute("style", "font-size:0.82em;color:#4b5563;margin-top:2px");
  desc.textContent = model.description;
  left.appendChild(desc);
  header.appendChild(left);

  const right = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  right.setAttribute("style", "display:flex;align-items:center;gap:8px;flex-shrink:0");
  const badge = doc.createElementNS(HTML_NS, "span") as HTMLElement;
  badge.setAttribute(
    "style",
    "display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.82em;white-space:nowrap",
  );
  right.appendChild(badge);

  if (enabledField) {
    const toggle = doc.createElementNS(HTML_NS, "input") as unknown as HTMLInputElement;
    toggle.setAttribute("type", "checkbox");
    toggle.checked = Boolean(draft[enabledKey]);
    toggle.addEventListener("change", () => {
      draft[enabledKey] = toggle.checked;
      writeFieldValue(model, enabledField, toggle.checked);
      if (!toggle.checked) {
        clearSourceVerified(model.scope, model.id);
      }
      updateStatus();
    });
    right.appendChild(toggle);
  }
  header.appendChild(right);
  wrap.appendChild(header);

  const statusInfo = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  statusInfo.setAttribute("style", "font-size:0.82em;color:#666;margin-top:6px");
  wrap.appendChild(statusInfo);

  const actions = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  actions.setAttribute(
    "style",
    "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px",
  );
  const probeButton = doc.createElementNS(HTML_NS, "button") as HTMLButtonElement;
  probeButton.textContent = lang === "zh" ? "测活" : "Probe";
  probeButton.setAttribute(
    "style",
    "padding:2px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer",
  );
  actions.appendChild(probeButton);

  const probeHint = doc.createElementNS(HTML_NS, "span") as HTMLElement;
  probeHint.setAttribute("style", "font-size:0.82em;color:#666");
  actions.appendChild(probeHint);
  wrap.appendChild(actions);

  const details = doc.createElementNS(HTML_NS, "details") as unknown as HTMLDetailsElement;
  details.open = false;
  details.setAttribute("style", "margin-top:8px");
  const summary = doc.createElementNS(HTML_NS, "summary") as HTMLElement;
  summary.textContent = lang === "zh" ? "展开配置" : "Show configuration";
  details.appendChild(summary);

  const body = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  body.setAttribute("style", "padding:8px 0 0 8px");

  const mutationHandler = (fieldKey: string) => {
    if (shouldInvalidateVerification(fieldKey)) {
      clearSourceVerified(model.scope, model.id);
    }
    updateStatus();
  };

  for (const field of basicFields) {
    renderField(doc, body, model, field, draft, lang, mutationHandler);
  }

  if (advancedFields.length) {
    const advanced = doc.createElementNS(HTML_NS, "details") as unknown as HTMLDetailsElement;
    advanced.setAttribute("style", "margin-top:6px");
    const advancedSummary = doc.createElementNS(HTML_NS, "summary") as HTMLElement;
    advancedSummary.textContent = lang === "zh" ? "高级" : "Advanced";
    advanced.appendChild(advancedSummary);

    const advancedBody = doc.createElementNS(HTML_NS, "div") as HTMLElement;
    advancedBody.setAttribute("style", "padding:8px 0 0 8px");
    for (const field of advancedFields) {
      renderField(doc, advancedBody, model, field, draft, lang, mutationHandler);
    }
    advanced.appendChild(advancedBody);
    body.appendChild(advanced);
  }

  details.appendChild(body);
  wrap.appendChild(details);

  let busy = false;
  let message = "";
  let messageTone: "neutral" | "error" | "success" = "neutral";

  const updateStatus = () => {
    const enabled = Boolean(draft[enabledKey]);
    const configured =
      model.scope === "platform"
        ? isPlatformConfigured(model.id, draft)
        : isWebConfigured(model.id, draft);
    const verifiedState =
      enabled && configured ? getSourceVerifiedState(model.scope, model.id) : null;
    const status = resolveWorkspaceSourceStatus(lang, enabled, configured, !!verifiedState);
    badge.textContent = status.text;
    badge.setAttribute(
      "style",
      `${status.tone};display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.82em;white-space:nowrap`,
    );

    const probeQuery = getSourceProbeQuery(model.scope, model.id, model.sourceType, draft);
    probeButton.disabled = busy || !enabled || !configured || !probeQuery;
    probeButton.style.opacity = probeButton.disabled ? "0.6" : "1";
    probeButton.style.cursor = probeButton.disabled ? "not-allowed" : "pointer";

    if (!enabled) {
      statusInfo.textContent = lang === "zh" ? "当前源已关闭。" : "This source is disabled.";
    } else if (!configured) {
      statusInfo.textContent = getMissingConfigText(lang, model.requiredKeys);
    } else if (verifiedState) {
      statusInfo.textContent = formatVerifiedInfo(lang, verifiedState);
    } else {
      statusInfo.textContent =
        lang === "zh"
          ? "配置已齐全，可执行测活确认源是否可用。"
          : "Configuration looks complete. Run a probe to confirm availability.";
    }

    if (message) {
      probeHint.textContent = message;
      probeHint.style.color =
        messageTone === "error" ? "#b91c1c" : messageTone === "success" ? "#166534" : "#666";
    } else if (!probeQuery) {
      probeHint.textContent =
        lang === "zh"
          ? "请先在通用设置或当前源高级设置中填写测活查询。"
          : "Set a probe query in General settings or this source's Advanced section.";
      probeHint.style.color = "#666";
    } else {
      probeHint.textContent =
        lang === "zh" ? `当前测活查询：${probeQuery}` : `Current probe query: ${probeQuery}`;
      probeHint.style.color = "#666";
    }
  };

  probeButton.addEventListener("click", async () => {
    busy = true;
    messageTone = "neutral";
    message = lang === "zh" ? "正在测活..." : "Probing...";
    updateStatus();

    try {
      const result = await probeSource({
        scope: model.scope,
        id: model.id,
        sourceType: model.sourceType,
        draft,
      });
      messageTone = "success";
      message = lang === "zh" ? `测活成功：${result.query}` : `Probe succeeded: ${result.query}`;
    } catch (error) {
      clearSourceVerified(model.scope, model.id);
      messageTone = "error";
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      updateStatus();
    }
  });

  updateStatus();
  return wrap;
}

function renderProviderCard(
  doc: Document,
  provider: PluggableSearchProvider,
  lang: "zh" | "en",
): HTMLElement {
  const model: CardModel = {
    scope: "platform",
    sourceType: provider.sourceType,
    id: provider.id,
    name: provider.name,
    description:
      provider.manifest.description ?? (lang === "zh" ? "已安装 Provider" : "Installed provider"),
    fields: normalizeProviderConfigFields(createAcademicConfigSchema(provider.manifest)),
    requiredKeys: getRequiredPlatformConfigKeys(provider.id),
    sourceLabel: lang === "zh" ? "外部 provider" : "External provider",
  };
  return renderCard(doc, model, lang);
}

function renderWebCard(doc: Document, backend: WebBackend, lang: "zh" | "en"): HTMLElement {
  const model: CardModel = {
    scope: "web",
    sourceType: "web",
    id: backend.id,
    name: backend.name,
    description:
      lang === "zh" && backend.descriptionZh ? backend.descriptionZh : backend.description,
    fields: createWebFields(backend),
    requiredKeys: getRequiredWebConfigKeys(backend.id),
    sourceLabel: [...backend.capabilities].join(" · "),
  };
  return renderCard(doc, model, lang);
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
        /* keep default label */
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
        provider instanceof PluggableSearchProvider && provider.sourceType === "academic",
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const patentProviders = providerRegistry
    .getAll()
    .filter(
      (provider): provider is PluggableSearchProvider =>
        provider instanceof PluggableSearchProvider && provider.sourceType === "patent",
    )
    .sort((a, b) => a.name.localeCompare(b.name));

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
        ? `当前已加载 ${report.academic.length} 个学术源，其中 ${report.academic.filter((entry) => entry.available).length} 个可直接搜索。`
        : `${report.academic.length} academic providers are loaded, and ${report.academic.filter((entry) => entry.available).length} are currently searchable.`,
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
        lang === "zh" ? "学术源加载异常" : "Academic provider load issues",
        academicIssues,
      ),
    );
  }

  if (academicProviders.length === 0) {
    container.appendChild(
      renderIssueList(
        doc,
        lang === "zh" ? "当前没有已加载的学术源" : "No academic sources are currently loaded",
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
      container.appendChild(renderProviderCard(doc, provider, lang));
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
        ? `当前已加载 ${report.patent.length} 个专利源，其中 ${report.patent.filter((entry) => entry.available).length} 个可直接搜索。`
        : `${report.patent.length} patent providers are loaded, and ${report.patent.filter((entry) => entry.available).length} are currently searchable.`,
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
        lang === "zh" ? "专利源加载异常" : "Patent provider load issues",
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
      container.appendChild(renderProviderCard(doc, provider, lang));
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
      renderIssueList(doc, lang === "zh" ? "网页后端异常" : "Web backend issues", webIssues),
    );
  }

  for (const backend of webBackendRegistry.getAll().sort((a, b) => a.name.localeCompare(b.name))) {
    container.appendChild(renderWebCard(doc, backend, lang));
  }

  const note = doc.createElementNS(HTML_NS, "p") as HTMLElement;
  note.setAttribute("data-l10n-id", "pref-sources-ext-note");
  note.setAttribute("style", "color:#888;font-size:0.82em;margin-top:10px");
  container.appendChild(note);
}
