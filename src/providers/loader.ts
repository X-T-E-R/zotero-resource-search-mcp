import { logger } from "../infra/Logger";
import { configProvider } from "../infra/ConfigProvider";
import { providerRegistry } from "./registry";
import "./resolvers/CrossrefResolver";
import type { LoadedProviderSource, ProviderManifest } from "./_sdk/types";
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
import { PluggableSearchProvider } from "./pluggable/PluggableSearchProvider";
import type { SearchProvider } from "../models/types";
import { registerWebSearchProvider } from "./web/WebSearchProvider";

const MAX_MANIFEST_BYTES = 16 * 1024;
const MAX_BUNDLE_BYTES = 512 * 1024;

async function fetchText(uri: string): Promise<string> {
  const r = await fetch(uri);
  if (!r.ok) {
    throw new Error(`fetch failed ${r.status}: ${uri}`);
  }
  return r.text();
}

interface BuiltinIndex {
  providers: string[];
}

async function fetchBuiltinProviderIds(): Promise<string[]> {
  try {
    const text = await fetchText(`${rootURI}providers/index.json`);
    const data = JSON.parse(text) as BuiltinIndex;
    if (!data || !Array.isArray(data.providers)) {
      return [];
    }
    return data.providers.filter((x) => typeof x === "string");
  } catch (e) {
    logger.warn("No builtin providers index (providers/index.json)", e);
    return [];
  }
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

function extraAvailabilityFor(manifest: ProviderManifest): (() => boolean) | undefined {
  switch (manifest.id) {
    case "wos":
      return () => !!configProvider.getString("api.wos.key");
    case "scopus":
      return () => !!configProvider.getString("api.elsevier.key");
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

export async function loadAllProviders(): Promise<void> {
  providerRegistry.clearSearchProviders();

  const merged = new Map<
    string,
    { manifest: ProviderManifest; bundle: string; source: LoadedProviderSource }
  >();

  const builtinIds = await fetchBuiltinProviderIds();
  for (const id of builtinIds) {
    const base = `${rootURI}providers/${id}/`;
    try {
      const manifestText = await fetchText(base + "manifest.json");
      assertManifestSize(manifestText);
      const manifest = parseProviderManifest(manifestText);
      if (manifest.id !== id) {
        throw new Error(`manifest.id ${manifest.id} does not match folder ${id}`);
      }
      assertMinPluginVersion(manifest.minPluginVersion);
      const bundle = await fetchText(base + "provider.js");
      assertBundleSize(bundle, `provider.js (${id})`);
      await verifyIntegrity(manifest, bundle);
      merged.set(id, { manifest, bundle, source: { kind: "builtin", path: base } });
    } catch (e) {
      logger.error(`Failed to load builtin provider ${id}`, e);
    }
  }

  const userRoot = getUserProvidersRoot();
  await ensureDirectory(userRoot);
  const userDirs = await listProviderSubdirectories(userRoot);

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
      merged.set(manifest.id, {
        manifest,
        bundle,
        source: { kind: "user", path: dir },
      });
    } catch (e) {
      logger.error(`Failed to load user provider in ${folderName}`, e);
    }
  }

  for (const [, entry] of merged) {
    try {
      registerOne(entry.manifest, entry.bundle, entry.source);
    } catch (e) {
      logger.error(`Failed to register provider ${entry.manifest.id}`, e);
    }
  }

  registerWebSearchProvider();
}

export async function reloadProviders(): Promise<void> {
  await loadAllProviders();
}

export interface ProviderSummaryEntry {
  id: string;
  name: string;
  version?: string;
  kind: "builtin" | "user" | "web";
  path?: string;
}

function isPluggableProvider(p: SearchProvider): p is PluggableSearchProvider {
  return "manifest" in p && "source" in p;
}

export function listProviderSummaries(): ProviderSummaryEntry[] {
  const out: ProviderSummaryEntry[] = [];
  for (const p of providerRegistry.getAll()) {
    if (p.id === "web") {
      out.push({ id: p.id, name: p.name, kind: "web" });
      continue;
    }
    if (isPluggableProvider(p)) {
      out.push({
        id: p.id,
        name: p.name,
        version: p.manifest.version,
        kind: p.source.kind,
        path: p.source.path,
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
