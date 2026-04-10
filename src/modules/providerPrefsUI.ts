import { listProviderSummaries, reloadProviders } from "../providers/loader";
import { installProviderFromZipFile, pickZipFile, removeUserProvider } from "./providerInstaller";
import { checkRegistryAndInstallUpdates } from "./remoteProviderRegistry";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function setupProviderPrefsUI(win: Window): void {
  const doc = win.document;

  const refresh = () => {
    const tbody = doc.getElementById("zrs-provider-list");
    if (!tbody) return;
    while (tbody.firstChild) {
      tbody.removeChild(tbody.firstChild);
    }
    try {
      const rows = listProviderSummaries();
      for (const r of rows) {
        const tr = doc.createElementNS(HTML_NS, "tr");
        const mk = (text: string) => {
          const td = doc.createElementNS(HTML_NS, "td") as HTMLElement;
          td.style.padding = "4px";
          td.textContent = text;
          return td;
        };
        tr.appendChild(mk(r.id));
        tr.appendChild(mk(r.name));
        tr.appendChild(mk(r.version ?? "—"));
        tr.appendChild(mk(r.kind));
        const tdAct = doc.createElementNS(HTML_NS, "td") as HTMLElement;
        tdAct.style.padding = "4px";
        if (r.kind === "user") {
          const btn = doc.createElementNS(HTML_NS, "button");
          btn.textContent = "Remove";
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
      td.setAttribute("colspan", "5");
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
