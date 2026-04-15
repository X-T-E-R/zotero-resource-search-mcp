import { getString } from "../utils/locale";

export function setupWorkspacePrefsUI(win: Window): void {
  const doc = win.document;
  const button = doc.getElementById("zrs-open-workspace") as HTMLButtonElement | null;
  if (!button) {
    return;
  }

  try {
    button.textContent = getString("pref-open-workspace-button");
  } catch {
    button.textContent = "Open Search Workspace";
  }

  button.setAttribute(
    "style",
    "padding:6px 12px;border:1px solid #d7dce5;border-radius:8px;background:#f7f9fc;cursor:pointer;font-size:0.9em",
  );
  button.addEventListener("click", () => {
    (addon.api as any)?.workspace?.openWindow?.(win);
  });
}
