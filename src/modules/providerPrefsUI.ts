import { listProviderSummaries, reloadProviders } from "../providers/loader";
import { installProviderFromZipFile, pickZipFile, removeUserProvider } from "./providerInstaller";
import { checkRegistryAndInstallUpdates } from "./remoteProviderRegistry";
import { getString } from "../utils/locale";

const HTML_NS = "http://www.w3.org/1999/xhtml";

function getLang(): "zh" | "en" {
  try {
    const locale = (Zotero as any).locale || "";
    return String(locale).toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

function localizeButtonText(
  doc: Document,
  id: string,
  key: string,
  fallback: string,
): void {
  const button = doc.getElementById(id) as HTMLButtonElement | null;
  if (!button) return;
  try {
    button.textContent = getString(key, "label") || fallback;
  } catch {
    button.textContent = fallback;
  }
  button.setAttribute(
    "style",
    "padding:6px 12px;border:1px solid #d7dce5;border-radius:6px;background:#f7f9fc;cursor:pointer;min-width:96px",
  );
}

export function setupProviderPrefsUI(win: Window): void {
  const doc = win.document;
  const lang = getLang();
  const headerMap: Array<[string, string]> = [
    ["zrs-provider-col-id", lang === "zh" ? "ID" : "ID"],
    ["zrs-provider-col-name", lang === "zh" ? "名称" : "Name"],
    ["zrs-provider-col-version", lang === "zh" ? "版本" : "Version"],
    ["zrs-provider-col-kind", lang === "zh" ? "类型" : "Kind"],
    ["zrs-provider-col-state", lang === "zh" ? "状态" : "State"],
    ["zrs-provider-col-error", lang === "zh" ? "错误" : "Error"],
    ["zrs-provider-col-action", lang === "zh" ? "操作" : "Action"],
  ];
  for (const [id, text] of headerMap) {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  }

  localizeButtonText(doc, "zrs-provider-refresh", "pref-providers-refresh", "Refresh list");
  localizeButtonText(doc, "zrs-provider-import", "pref-providers-import", "Import .zip");
  localizeButtonText(doc, "zrs-provider-reload", "pref-providers-reload", "Reload providers");
  localizeButtonText(
    doc,
    "zrs-provider-registry-check",
    "pref-providers-registry-check",
    "Check registry",
  );

  const statusLabel = (state: string): string => {
    if (lang === "zh") {
      return (
        {
          ready: "可用",
          registered: "已注册",
          "missing config": "缺少配置",
          disabled: "已禁用",
          "load failed": "加载失败",
        }[state] ?? state
      );
    }
    return state;
  };

  const statusTone = (state: string): string => {
    switch (state) {
      case "ready":
        return "background:#e8f7ee;color:#0f6b3d;border:1px solid #b7e2c4";
      case "registered":
        return "background:#eef4ff;color:#285ea8;border:1px solid #c9dafc";
      case "missing config":
        return "background:#fff4e5;color:#a35a00;border:1px solid #f1d2a5";
      case "disabled":
        return "background:#f3f4f6;color:#555;border:1px solid #dadde3";
      default:
        return "background:#fdecec;color:#b42318;border:1px solid #f4c7c7";
    }
  };

  const refresh = () => {
    const tbody = doc.getElementById("zrs-provider-list");
    if (!tbody) return;
    while (tbody.firstChild) {
      tbody.removeChild(tbody.firstChild);
    }
    try {
      const rows = listProviderSummaries();
      rows.sort((a, b) => {
        if (a.available !== b.available) return a.available ? -1 : 1;
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
      for (let index = 0; index < rows.length; index++) {
        const r = rows[index];
        const tr = doc.createElementNS(HTML_NS, "tr");
        tr.setAttribute(
          "style",
          `border-top:1px solid #eef1f5;background:${index % 2 === 0 ? "#ffffff" : "#fbfcfe"}`,
        );
        const mk = (text: string) => {
          const td = doc.createElementNS(HTML_NS, "td") as HTMLElement;
          td.style.padding = "6px 8px";
          td.style.verticalAlign = "top";
          td.textContent = text;
          return td;
        };
        tr.appendChild(mk(r.id));
        tr.appendChild(mk(r.name));
        tr.appendChild(mk(r.version ?? "—"));
        tr.appendChild(mk(r.kind));
        const state = r.registered
          ? r.available
            ? "ready"
            : r.enabled
              ? r.configured
                ? "registered"
                : "missing config"
              : "disabled"
          : "load failed";
        const tdState = doc.createElementNS(HTML_NS, "td") as HTMLElement;
        tdState.style.padding = "6px 8px";
        const badge = doc.createElementNS(HTML_NS, "span") as HTMLElement;
        badge.textContent = statusLabel(state);
        badge.setAttribute(
          "style",
          `${statusTone(state)};display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.82em;white-space:nowrap`,
        );
        tdState.appendChild(badge);
        tr.appendChild(tdState);
        tr.appendChild(mk(r.error ?? "—"));
        const tdAct = doc.createElementNS(HTML_NS, "td") as HTMLElement;
        tdAct.style.padding = "6px 8px";
        if (r.kind === "user") {
          const btn = doc.createElementNS(HTML_NS, "button");
          btn.textContent = lang === "zh" ? "移除" : "Remove";
          btn.setAttribute(
            "style",
            "padding:4px 10px;border:1px solid #d7dce5;border-radius:6px;background:#fff;cursor:pointer",
          );
          btn.addEventListener("click", async () => {
            if (!win.confirm(`Remove user provider "${r.id}"?`)) return;
            try {
              await removeUserProvider(r.id);
              await reloadProviders();
              refresh();
            } catch (e) {
              win.alert(String(e));
            }
          });
          tdAct.appendChild(btn);
        } else {
          tdAct.textContent = "—";
        }
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      }
    } catch (e) {
      const tr = doc.createElementNS(HTML_NS, "tr");
      const td = doc.createElementNS(HTML_NS, "td");
      td.setAttribute("colspan", "7");
      td.textContent = `Error: ${e}`;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  };

  doc.getElementById("zrs-provider-refresh")?.addEventListener("click", () => refresh());

  doc.getElementById("zrs-provider-import")?.addEventListener("click", async () => {
    const path = await pickZipFile(win);
    if (!path) return;
    try {
      const id = await installProviderFromZipFile(path);
      await reloadProviders();
      win.alert(`Installed provider: ${id}`);
      refresh();
    } catch (e) {
      win.alert(String(e));
    }
  });

  doc.getElementById("zrs-provider-reload")?.addEventListener("click", async () => {
    try {
      await reloadProviders();
      refresh();
      win.alert("Search providers reloaded.");
    } catch (e) {
      win.alert(String(e));
    }
  });

  doc.getElementById("zrs-provider-registry-check")?.addEventListener("click", async () => {
    try {
      const ids = await checkRegistryAndInstallUpdates();
      win.alert(ids.length ? `Updated: ${ids.join(", ")}` : "No updates installed.");
      refresh();
    } catch (e) {
      win.alert(String(e));
    }
  });

  refresh();
}
