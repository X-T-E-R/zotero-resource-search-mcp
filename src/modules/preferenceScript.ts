import { config } from "../../package.json";

export function registerPreferencePane(win: Window) {
  try {
    (win as any).MozXULElement?.insertFTLIfNeeded?.(`${config.addonRef}-preferences.ftl`);
  } catch (e) {
    ztoolkit.log(`Preference pane FTL insertion failed: ${e}`, "warn");
  }
}
