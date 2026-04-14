import { config } from "../../package.json";

const SECRET_ORIGIN = "chrome://zotero-resource-search-mcp";
const SECRET_REALM = "Zotero Resource Search MCP";

const STATIC_SECRET_KEYS = new Set([
  "api.wos.key",
  "api.pubmed.key",
  "api.semanticScholar.key",
  "api.elsevier.key",
  "web.mysearch.apiKey",
  "web.tavily.apiKey",
  "web.firecrawl.apiKey",
  "web.exa.apiKey",
  "web.xai.apiKey",
  "platform.patentstar.password",
]);

const dynamicSecretKeys = new Set<string>();

function fullPrefName(key: string): string {
  return `${config.prefsPrefix}.${key}`;
}

function getLoginManager(): nsILoginManager | null {
  try {
    return Services.logins ?? null;
  } catch {
    return null;
  }
}

function createLoginInfo(username: string, password: string): nsILoginInfo {
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(SECRET_ORIGIN, null, SECRET_REALM, username, password, "", "");
  return loginInfo;
}

function getLegacyPrefValue(key: string): string {
  try {
    const value = Zotero.Prefs.get(fullPrefName(key), true);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function setLegacyPrefValue(key: string, value: string): void {
  try {
    Zotero.Prefs.set(fullPrefName(key), value, true);
  } catch {
    /* ignore */
  }
}

function clearLegacyPrefValue(key: string): void {
  try {
    Zotero.Prefs.clear(fullPrefName(key), true);
  } catch {
    /* ignore */
  }
}

export type SecretStorageBackend = "loginManager" | "prefsFallback";

class SecretStore {
  registerSecretKey(key: string): void {
    dynamicSecretKeys.add(key);
  }

  isSecretKey(key: string): boolean {
    return STATIC_SECRET_KEYS.has(key) || dynamicSecretKeys.has(key);
  }

  getBackend(): SecretStorageBackend {
    return getLoginManager() ? "loginManager" : "prefsFallback";
  }

  describe() {
    return {
      backend: this.getBackend(),
      secure: this.getBackend() === "loginManager",
    };
  }

  getString(key: string, defaultValue = ""): string {
    if (!this.isSecretKey(key)) {
      return getLegacyPrefValue(key) || defaultValue;
    }

    const loginManager = getLoginManager();
    if (loginManager) {
      try {
        const existing = loginManager
          .findLogins(SECRET_ORIGIN, "", SECRET_REALM)
          .find((login) => login.username === key);
        if (existing?.password) {
          return existing.password;
        }
      } catch {
        /* ignore */
      }

      const legacy = getLegacyPrefValue(key);
      if (legacy) {
        this.setString(key, legacy);
        clearLegacyPrefValue(key);
        return legacy;
      }
      return defaultValue;
    }

    return getLegacyPrefValue(key) || defaultValue;
  }

  setString(key: string, value: string): void {
    this.registerSecretKey(key);
    const loginManager = getLoginManager();
    if (!loginManager) {
      setLegacyPrefValue(key, value);
      return;
    }

    try {
      const existing = loginManager
        .findLogins(SECRET_ORIGIN, "", SECRET_REALM)
        .find((login) => login.username === key);
      if (existing) {
        if (!value) {
          loginManager.removeLogin(existing);
        } else {
          loginManager.modifyLogin(existing, createLoginInfo(key, value));
        }
      } else if (value) {
        void loginManager.addLoginAsync(createLoginInfo(key, value));
      }
      clearLegacyPrefValue(key);
    } catch {
      setLegacyPrefValue(key, value);
    }
  }

  clear(key: string): void {
    const loginManager = getLoginManager();
    if (loginManager) {
      try {
        const existing = loginManager
          .findLogins(SECRET_ORIGIN, "", SECRET_REALM)
          .find((login) => login.username === key);
        if (existing) {
          loginManager.removeLogin(existing);
        }
      } catch {
        /* ignore */
      }
    }
    clearLegacyPrefValue(key);
  }
}

export const secretStore = new SecretStore();
