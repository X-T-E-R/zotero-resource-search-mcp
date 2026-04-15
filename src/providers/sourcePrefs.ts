import { config } from "../../package.json";
import { configProvider } from "../infra/ConfigProvider";
import { secretStore } from "../infra/SecretStore";

export type SourceScope = "platform" | "web";
export type ProbeSourceType = "academic" | "patent" | "web";

interface LegacyMigration {
  from: string;
  to: string;
  secret?: boolean;
}

const LEGACY_MIGRATIONS: LegacyMigration[] = [
  { from: "api.wos.key", to: "platform.wos.apiKey", secret: true },
  { from: "api.elsevier.key", to: "platform.scopus.apiKey", secret: true },
  { from: "api.pubmed.key", to: "platform.pubmed.apiKey", secret: true },
  { from: "api.semanticScholar.key", to: "platform.semantic.apiKey", secret: true },
  { from: "api.crossref.mailto", to: "platform.crossref.mailto" },
];

const REQUIRED_PLATFORM_CONFIG: Record<string, string[]> = {
  wos: ["apiKey"],
  scopus: ["apiKey"],
  patentstar: ["loginName", "password"],
};

const REQUIRED_WEB_CONFIG: Record<string, string[]> = {
  tavily: ["apiKey"],
  firecrawl: ["apiKey"],
  exa: ["apiKey"],
  xai: ["apiKey"],
  mysearch: ["baseUrl"],
};

function prefKey(key: string): string {
  return `${config.prefsPrefix}.${key}`;
}

function setPrefString(key: string, value: string): void {
  Zotero.Prefs.set(prefKey(key), value, true);
}

function clearPref(key: string): void {
  Zotero.Prefs.clear(prefKey(key), true);
}

function readDraftString(
  draft: Record<string, unknown> | undefined,
  key: string,
  fallback = "",
): string {
  if (draft && key in draft) {
    const value = draft[key];
    if (value === undefined || value === null) return fallback;
    return String(value);
  }
  return configProvider.getString(key, fallback);
}

export function migrateLegacyProviderPrefs(): void {
  for (const mapping of LEGACY_MIGRATIONS) {
    const nextValue = mapping.secret
      ? secretStore.getString(mapping.to, "")
      : configProvider.getString(mapping.to, "");
    if (nextValue) {
      continue;
    }

    const legacyValue = mapping.secret
      ? secretStore.getString(mapping.from, "")
      : configProvider.getString(mapping.from, "");
    if (!legacyValue) {
      continue;
    }

    if (mapping.secret) {
      secretStore.setString(mapping.to, legacyValue);
    } else {
      setPrefString(mapping.to, legacyValue);
    }
  }
}

export function getRequiredPlatformConfigKeys(providerId: string): string[] {
  return REQUIRED_PLATFORM_CONFIG[providerId] ?? [];
}

export function getRequiredWebConfigKeys(backendId: string): string[] {
  return REQUIRED_WEB_CONFIG[backendId] ?? [];
}

export function isPlatformConfigured(providerId: string, draft?: Record<string, unknown>): boolean {
  const keys = getRequiredPlatformConfigKeys(providerId);
  if (keys.length === 0) return true;
  return keys.every(
    (key) => readDraftString(draft, `platform.${providerId}.${key}`).trim().length > 0,
  );
}

export function isWebConfigured(backendId: string, draft?: Record<string, unknown>): boolean {
  const keys = getRequiredWebConfigKeys(backendId);
  if (keys.length === 0) return true;
  return keys.every((key) => readDraftString(draft, `web.${backendId}.${key}`).trim().length > 0);
}

export function getGlobalProbeQuery(sourceType: ProbeSourceType): string {
  switch (sourceType) {
    case "academic":
      return configProvider.getString("general.probeQueryAcademic", "").trim();
    case "patent":
      return configProvider.getString("general.probeQueryPatent", "").trim();
    case "web":
      return configProvider.getString("general.probeQueryWeb", "").trim();
  }
}

export function getSourceProbeQuery(
  scope: SourceScope,
  id: string,
  sourceType: ProbeSourceType,
  draft?: Record<string, unknown>,
): string {
  const sourceKey = `${scope}.${id}.probeQuery`;
  const sourceQuery = readDraftString(draft, sourceKey, "").trim();
  return sourceQuery || getGlobalProbeQuery(sourceType);
}

export function markSourceVerified(scope: SourceScope, id: string, query: string): void {
  const now = new Date().toISOString();
  setPrefString(`${scope}.${id}.verifiedAt`, now);
  setPrefString(`${scope}.${id}.verifiedQuery`, query);
}

export function clearSourceVerified(scope: SourceScope, id: string): void {
  clearPref(`${scope}.${id}.verifiedAt`);
  clearPref(`${scope}.${id}.verifiedQuery`);
}

export function getSourceVerifiedState(
  scope: SourceScope,
  id: string,
): {
  verifiedAt: string;
  verifiedQuery: string;
} | null {
  const verifiedAt = configProvider.getString(`${scope}.${id}.verifiedAt`, "").trim();
  if (!verifiedAt) {
    return null;
  }
  return {
    verifiedAt,
    verifiedQuery: configProvider.getString(`${scope}.${id}.verifiedQuery`, "").trim(),
  };
}

function resolveMaxResultsRule(
  value: number | undefined,
  globalMax: number,
  limit?: number,
): number | undefined | null {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value > 0) {
    return value;
  }
  if (value === 0) {
    return globalMax;
  }
  if (value === -1) {
    return typeof limit === "number" && limit > 0 ? limit : undefined;
  }
  return globalMax;
}

export function resolveScopedMaxResults(options: {
  requested?: number;
  configured?: number;
  limit?: number;
  globalMax?: number;
}): number | undefined {
  const globalMax = options.globalMax ?? configProvider.getNumber("general.maxResults", 25);
  const requested = resolveMaxResultsRule(options.requested, globalMax, options.limit);
  if (requested !== null) {
    return requested;
  }
  const configured = resolveMaxResultsRule(options.configured, globalMax, options.limit);
  if (configured !== null) {
    return configured;
  }
  return globalMax;
}
