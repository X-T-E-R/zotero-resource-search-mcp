const PREFS_PREFIX = "extensions.zotero.zotero-resource-search";

function prefKey(key: string): string {
  return `${PREFS_PREFIX}.${key}`;
}

export const configProvider = {
  get(key: string): any {
    try {
      return Zotero.Prefs.get(prefKey(key), true);
    } catch {
      return undefined;
    }
  },

  getString(key: string, defaultValue: string = ""): string {
    const val = this.get(key);
    if (typeof val === "string") return val;
    return defaultValue;
  },

  getNumber(key: string, defaultValue: number = 0): number {
    const val = this.get(key);
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isFinite(n) ? n : defaultValue;
    }
    return defaultValue;
  },

  getBool(key: string, defaultValue: boolean = false): boolean {
    const val = this.get(key);
    if (typeof val === "boolean") return val;
    return defaultValue;
  },
};
