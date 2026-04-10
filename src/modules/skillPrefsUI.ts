/**
 * Export / install Agent Skill (SKILL.md) from preferences — same UX as Zotero MCP Neo.
 */

import { getString } from "../utils/locale";
import { config } from "../../package.json";
import { generateSkillMd } from "./skillMarkdown";

function copyStringToClipboard(text: string): void {
  const ch = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
  ch.copyString(text);
}

function ensureDirRecursive(homeDir: { clone: () => any }, relativePath: string): any {
  const parts = relativePath.split("/").filter(Boolean);
  const dir = homeDir.clone();
  for (const p of parts) {
    dir.append(p);
    if (!dir.exists()) {
      dir.create(dir.DIRECTORY_TYPE, 0o755);
    }
  }
  return dir;
}

export function setupSkillPrefsUI(win: Window): void {
  const doc = win.document;
  const portInput = doc.getElementById("zrs-mcp-port-input") as HTMLInputElement | null;
  const skillTargetSelect = doc.getElementById("skill-target-select") as HTMLSelectElement | null;
  const exportSkillButton = doc.getElementById("export-skill-button") as HTMLButtonElement | null;
  const installSkillButton = doc.getElementById("install-skill-button") as HTMLButtonElement | null;
  const skillMessage = doc.getElementById("skill-export-message") as HTMLElement | null;

  function getPort(): number {
    const raw = portInput?.value?.trim() || String(Zotero.Prefs.get(`${config.prefsPrefix}.mcp.server.port`, true) ?? "23121");
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 23121;
  }

  function getSkillContent(): string {
    return generateSkillMd(getPort());
  }

  function msg(key: string, fallback: string): string {
    try {
      const s = getString(key);
      if (s && !s.includes(`${config.addonRef}-${key}`)) return s;
    } catch {
      /* ignore */
    }
    return fallback;
  }

  exportSkillButton?.addEventListener("click", async () => {
    try {
      const target = skillTargetSelect?.value || "clipboard";
      const content = getSkillContent();
      if (target === "clipboard") {
        copyStringToClipboard(content);
        if (skillMessage) skillMessage.textContent = msg("pref-skills-copied", "Copied to clipboard.");
      } else {
        const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
        fp.init(win as any, "Export SKILL.md", Ci.nsIFilePicker.modeSave);
        fp.defaultString = "SKILL.md";
        fp.appendFilter("Markdown", "*.md");
        const rv = await new Promise<number>((resolve) => fp.open(resolve));
        if (rv === Ci.nsIFilePicker.returnOK || rv === Ci.nsIFilePicker.returnReplace) {
          const file = fp.file;
          const os = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
          os.init(file, 0x02 | 0x08 | 0x20, 0o644, 0);
          const converter = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(
            Ci.nsIConverterOutputStream,
          );
          (converter as any).init(os, "UTF-8", 0, 0);
          converter.writeString(content);
          converter.close();
          if (skillMessage) skillMessage.textContent = msg("pref-skills-export-success", "Exported successfully.");
        }
      }
    } catch (error) {
      if (skillMessage) skillMessage.textContent = `Error: ${error}`;
    }
  });

  installSkillButton?.addEventListener("click", async () => {
    try {
      const target = skillTargetSelect?.value || "cursor";
      const content = getSkillContent();
      const homeDir = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties)
        .get("Home", Ci.nsIFile);
      const pathMap: Record<string, string> = {
        cursor: ".cursor/skills/zotero-resource-search-mcp",
        "claude-code": ".claude/skills/zotero-resource-search-mcp",
        codex: ".codex/skills/zotero-resource-search-mcp",
      };
      const relPath = pathMap[target];
      if (!relPath) {
        if (skillMessage) skillMessage.textContent = msg("pref-skills-install-error", "Choose Cursor, Claude Code, or Codex (not Clipboard).");
        return;
      }
      const dir = ensureDirRecursive(homeDir, relPath);
      const skillFile = dir.clone();
      skillFile.append("SKILL.md");
      const os = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
      os.init(skillFile, 0x02 | 0x08 | 0x20, 0o644, 0);
      const converter = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
      (converter as any).init(os, "UTF-8", 0, 0);
      converter.writeString(content);
      converter.close();
      if (skillMessage) {
        skillMessage.textContent = `${msg("pref-skills-install-success", "Installed:")} ${dir.path}`;
      }
    } catch (error) {
      if (skillMessage) {
        skillMessage.textContent = `${msg("pref-skills-install-failed", "Install failed")}: ${error}`;
      }
    }
  });
}
