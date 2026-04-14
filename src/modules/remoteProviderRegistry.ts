/**
 * Fetch a remote provider registry JSON and install updates with SHA-256 verification.
 */

import { getPref } from "../utils/prefs";
import { installProviderFromZipFile } from "./providerInstaller";
import { expandRegistryUrlCandidates } from "./providerRegistryUrl";
import {
  getUserProvidersRoot,
  joinPaths,
  removePath,
  sha256Hex,
  writeBinaryFile,
} from "../providers/runtime/fsUtils";
import { reloadProviders } from "../providers/loader";
import { getPluginVersion, semverGte } from "../providers/runtime/semver";

export interface RemoteRegistryEntry {
  id: string;
  version: string;
  downloadUrl: string;
  sha256?: string;
  minPluginVersion?: string;
}

export interface RemoteRegistryManifest {
  providers: RemoteRegistryEntry[];
}

export async function fetchRegistry(url: string): Promise<RemoteRegistryManifest> {
  const candidates = expandRegistryUrlCandidates(url);
  const errors: string[] = [];
  for (const candidate of candidates) {
    const r = await fetch(candidate, { cache: "no-store" });
    if (!r.ok) {
      errors.push(`${candidate} -> HTTP ${r.status}`);
      continue;
    }
    const data = (await r.json()) as unknown as RemoteRegistryManifest;
    if (!data || !Array.isArray(data.providers)) {
      errors.push(`${candidate} -> invalid registry JSON`);
      continue;
    }
    return data;
  }
  throw new Error(errors.length ? errors.join(" | ") : "Invalid registry URL");
}

export async function installRegistryEntry(entry: RemoteRegistryEntry): Promise<void> {
  if (entry.minPluginVersion && !semverGte(getPluginVersion(), entry.minPluginVersion)) {
    throw new Error(`Plugin version must be >= ${entry.minPluginVersion}`);
  }
  const r = await fetch(entry.downloadUrl, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Download failed: ${r.status}`);
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  if (entry.sha256) {
    const h = await sha256Hex(buf);
    if (h.toLowerCase() !== entry.sha256.toLowerCase()) {
      throw new Error("SHA-256 checksum mismatch");
    }
  }
  const tmp = joinPaths(getUserProvidersRoot(), `._dl_${entry.id}_${Date.now()}.zip`);
  await writeBinaryFile(tmp, buf);
  try {
    await installProviderFromZipFile(tmp);
  } finally {
    await removePath(tmp, false);
  }
  await reloadProviders();
}

export async function checkRegistryAndInstallUpdates(): Promise<string[]> {
  const url = getPref("providers.registryUrl");
  if (!url || !url.trim()) {
    throw new Error("Set providers registry URL in preferences first");
  }
  const reg = await fetchRegistry(url.trim());
  const installed: string[] = [];
  for (const entry of reg.providers) {
    try {
      await installRegistryEntry(entry);
      installed.push(entry.id);
    } catch (e) {
      /* continue others */
      Zotero.debug(`[ResourceSearch] registry install ${entry.id} failed: ${e}`);
    }
  }
  return installed;
}
