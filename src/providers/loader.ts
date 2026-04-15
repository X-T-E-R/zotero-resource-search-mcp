import { logger } from "../infra/Logger";
import { configProvider } from "../infra/ConfigProvider";
import { providerRegistry } from "./registry";
import "./resolvers/CrossrefResolver";
import type { LoadedProviderSource, ProviderManifest } from "./_sdk/types";
import type { PluggableProviderImpl, ProviderAPI } from "./_sdk/types";
import { parseProviderManifest } from "./manifest/validate";
import { createProviderApi } from "./runtime/createProviderApi";
import {
  basename,
  getUserProvidersRoot,
  joinPaths,
  listProviderSubdirectories,
  readTextFile,
  ensureDirectory,
  sha256Hex,
} from "./runtime/fsUtils";
import { assertMinPluginVersion } from "./runtime/semver";
import { invokeProviderFactory } from "./sandbox/invokeFactory";
import {
  PluggableSearchProvider,
  type ProviderAvailabilityCheck,
} from "./pluggable/PluggableSearchProvider";
import { registerWebSearchProvider } from "./web/WebSearchProvider";
import {
  registerBuiltinWebBackends,
  type WebBackendRegistrationResult,
} from "./web/registerBuiltinWebBackends";
import { webBackendRegistry } from "./web/WebBackendRegistry";
import { isPlatformConfigured, migrateLegacyProviderPrefs } from "./sourcePrefs";

export interface ProviderStartupEntry {
  id: string;
  name: string;
  sourceType: "academic" | "web" | "patent";
  kind: "user" | "web";
  version?: string;
  source?: string;
  capabilities?: string[];
  registered: boolean;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  error?: string;
}

export interface ProviderStartupReport {
  academic: ProviderStartupEntry[];
  patent: ProviderStartupEntry[];
  web: ProviderStartupEntry[];
  issues: string[];
}

export interface ProviderSummaryEntry {
  id: string;
  name: string;
  version?: string;
  kind: "user" | "web";
  sourceType: "academic" | "web" | "patent";
  path?: string;
  registered: boolean;
  enabled: boolean;
  configured: boolean;
  available: boolean;
  error?: string;
}

interface StartupEntryBase {
  id: string;
  name: string;
  sourceType: "academic" | "web" | "patent";
  kind: "user" | "web";
  version?: string;
  source?: string;
  capabilities?: string[];
  registered: boolean;
  error?: string;
}

const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_BUNDLE_BYTES = 512 * 1024;

const startupState: {
  entries: Map<string, StartupEntryBase>;
  issues: string[];
} = {
  entries: new Map(),
  issues: [],
};

function reportZoteroError(scope: string, error: unknown): void {
  try {
    const message = `${scope}: ${error instanceof Error ? error.message : String(error)}`;
    Zotero.logError(new Error(message));
  } catch {
    /* ignore console reporting failures */
  }
}

function resetStartupState(): void {
  startupState.entries.clear();
  startupState.issues = [];
}

function recordStartupIssue(scope: string, error: unknown): void {
  const message = `${scope}: ${error instanceof Error ? error.message : String(error)}`;
  startupState.issues.push(message);
  logger.error(message);
  reportZoteroError(scope, error);
}

function recordStartupEntry(entry: StartupEntryBase): void {
  startupState.entries.set(entry.id, entry);
}

function assertBundleSize(text: string, label: string): void {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_BUNDLE_BYTES) {
    throw new Error(`${label} exceeds ${MAX_BUNDLE_BYTES} bytes (${bytes})`);
  }
}

function assertManifestSize(text: string): void {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > MAX_MANIFEST_BYTES) {
    throw new Error(`manifest.json exceeds ${MAX_MANIFEST_BYTES} bytes`);
  }
}

async function verifyIntegrity(manifest: ProviderManifest, bundleText: string): Promise<void> {
  const expected = manifest.integrity?.sha256;
  if (!expected) {
    return;
  }
  const enc = new TextEncoder();
  const h = await sha256Hex(enc.encode(bundleText));
  if (h.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Integrity check failed for ${manifest.id}`);
  }
}

function extraAvailabilityFor(manifest: ProviderManifest): ProviderAvailabilityCheck | undefined {
  switch (manifest.id) {
    case "wos":
      return {
        check: () => isPlatformConfigured("wos"),
        reason: "Missing Web of Science API key",
      };
    case "scopus":
      return {
        check: () => isPlatformConfigured("scopus"),
        reason: "Missing Elsevier API key",
      };
    case "patentstar":
      return {
        check: () => isPlatformConfigured("patentstar"),
        reason: "Missing PatentStar login credentials",
      };
    default:
      return undefined;
  }
}

function registerOne(
  manifest: ProviderManifest,
  bundleCode: string,
  source: LoadedProviderSource,
): void {
  const api = createProviderApi(manifest, manifest.id);
  const impl = invokeProviderFactory(bundleCode, manifest, api);
  const provider = new PluggableSearchProvider(
    manifest,
    impl,
    source,
    extraAvailabilityFor(manifest),
  );
  providerRegistry.registerSearchProvider(provider);
}

function buildAcademicRuntimeEntry(entry: StartupEntryBase): ProviderStartupEntry {
  const provider = providerRegistry.get(entry.id);
  const status =
    provider instanceof PluggableSearchProvider
      ? provider.getRuntimeStatus()
      : {
          enabled: configProvider.getBool(`platform.${entry.id}.enabled`, true),
          configured: false,
          available: false,
          reason: undefined as string | undefined,
        };
  const fallbackError =
    entry.error ||
    (entry.registered && !(provider instanceof PluggableSearchProvider)
      ? "Provider was marked registered but is missing from the runtime registry"
      : !entry.registered
        ? "Provider failed to register, but no detailed startup error was captured"
        : undefined);

  return {
    ...entry,
    registered: entry.registered && provider instanceof PluggableSearchProvider,
    enabled: status.enabled,
    configured: status.configured,
    available: status.available,
    error: fallbackError || status.reason,
  };
}

function buildWebRuntimeEntry(entry: StartupEntryBase): ProviderStartupEntry {
  const backend = webBackendRegistry.get(entry.id);
  const enabled = backend
    ? backend.isEnabled()
    : configProvider.getBool(`web.${entry.id}.enabled`, true);
  const configured = backend ? backend.hasRequiredConfig() : false;
  const available = backend ? backend.isConfigured() : false;

  return {
    ...entry,
    registered: entry.registered && !!backend,
    enabled,
    configured,
    available,
    capabilities: entry.capabilities ?? (backend ? [...backend.capabilities] : []),
  };
}

function recordWebBackendResults(results: WebBackendRegistrationResult[]): void {
  for (const result of results) {
    recordStartupEntry({
      id: result.id,
      name: result.name,
      sourceType: "web",
      kind: "web",
      capabilities: result.capabilities,
      registered: result.registered,
      error: result.error,
    });
  }
}

export async function loadAllProviders(): Promise<void> {
  providerRegistry.clearSearchProviders();
  resetStartupState();
  migrateLegacyProviderPrefs();

  const merged = new Map<
    string,
    { manifest: ProviderManifest; bundle: string; source: LoadedProviderSource }
  >();

  const userRoot = getUserProvidersRoot();
  let userDirs: string[] = [];
  try {
    await ensureDirectory(userRoot);
    userDirs = await listProviderSubdirectories(userRoot);
  } catch (e) {
    recordStartupIssue("Failed to prepare user provider directory", e);
  }

  for (const dir of userDirs) {
    const folderName = basename(dir);
    try {
      const manifestText = await readTextFile(joinPaths(dir, "manifest.json"));
      assertManifestSize(manifestText);
      const manifest = parseProviderManifest(manifestText);
      if (manifest.id !== folderName) {
        throw new Error(`manifest.id ${manifest.id} must match directory name ${folderName}`);
      }
      assertMinPluginVersion(manifest.minPluginVersion);
      const bundle = await readTextFile(joinPaths(dir, "provider.js"));
      assertBundleSize(bundle, `provider.js (${manifest.id})`);
      await verifyIntegrity(manifest, bundle);
      recordStartupEntry({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        sourceType: manifest.sourceType,
        kind: "user",
        source: dir,
        registered: false,
      });
      merged.set(manifest.id, {
        manifest,
        bundle,
        source: { kind: "user", path: dir },
      });
    } catch (e) {
      logger.error(`Failed to load user provider in ${folderName}`, e);
      reportZoteroError(`Failed to load user provider in ${folderName}`, e);
      recordStartupEntry({
        id: folderName,
        name: folderName,
        sourceType: "academic",
        kind: "user",
        source: dir,
        registered: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  for (const [, entry] of merged) {
    try {
      registerOne(entry.manifest, entry.bundle, entry.source);
      recordStartupEntry({
        id: entry.manifest.id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        sourceType: entry.manifest.sourceType,
        kind: entry.source.kind,
        source: entry.source.path,
        registered: true,
      });
    } catch (e) {
      logger.error(`Failed to register provider ${entry.manifest.id}`, e);
      reportZoteroError(`Failed to register provider ${entry.manifest.id}`, e);
      recordStartupEntry({
        id: entry.manifest.id,
        name: entry.manifest.name,
        version: entry.manifest.version,
        sourceType: entry.manifest.sourceType,
        kind: entry.source.kind,
        source: entry.source.path,
        registered: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  try {
    recordWebBackendResults(registerBuiltinWebBackends());
  } catch (e) {
    recordStartupIssue("Failed to register builtin web backends", e);
  }

  try {
    registerWebSearchProvider();
  } catch (e) {
    recordStartupIssue("Failed to register unified web search provider", e);
  }
}

export async function reloadProviders(): Promise<void> {
  await loadAllProviders();
}

export function getProviderStartupReport(): ProviderStartupReport {
  const entries = [...startupState.entries.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    academic: entries
      .filter((entry) => entry.sourceType === "academic")
      .map((entry) => buildAcademicRuntimeEntry(entry)),
    patent: entries
      .filter((entry) => entry.sourceType === "patent")
      .map((entry) => buildAcademicRuntimeEntry(entry)),
    web: entries
      .filter((entry) => entry.sourceType === "web")
      .map((entry) => buildWebRuntimeEntry(entry)),
    issues: [...startupState.issues],
  };
}

export function listProviderSummaries(): ProviderSummaryEntry[] {
  const report = getProviderStartupReport();
  return [...report.academic, ...report.patent, ...report.web].map((entry) => ({
    id: entry.id,
    name: entry.name,
    version: entry.version,
    kind: entry.kind,
    sourceType: entry.sourceType,
    path: entry.source,
    registered: entry.registered,
    enabled: entry.enabled,
    configured: entry.configured,
    available: entry.available,
    error: entry.error,
  }));
}
