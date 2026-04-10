/**
 * Install pluggable provider packages from a .zip (layout: <id>/manifest.json + provider.js,
 * or flat manifest.json + provider.js at zip root).
 */

import { parseProviderManifest } from "../providers/manifest/validate";
import {
  ensureDirectory,
  getUserProvidersRoot,
  joinPaths,
  listProviderSubdirectories,
  readTextFile,
  removePath,
} from "../providers/runtime/fsUtils";

function getFileUtils(): { File: new (path: string) => nsIFile } {
  return ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs") as {
    File: new (path: string) => nsIFile;
  };
}

interface nsIFile {
  path: string;
  exists: () => boolean;
  isDirectory: () => boolean;
  create: (type: number, perm: number) => void;
  DIRECTORY_TYPE: number;
  append: (node: string) => void;
  copyTo: (newParentDir: nsIFile, newName: string) => nsIFile;
  remove: (recursive: boolean) => void;
  clone: () => nsIFile;
}

/**
 * Extract zip using nsIZipReader (sync).
 */
export function unzipToDirectory(zipPath: string, destDir: string): void {
  const { File } = getFileUtils();
  const zr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  const zipFile = new File(zipPath);
  zr.open(zipFile);
  try {
    const destRoot = new File(destDir);
    if (!destRoot.exists()) {
      destRoot.create(destRoot.DIRECTORY_TYPE, 0o755);
    }
    const entries = zr.findEntries("*");
    while (entries.hasMore()) {
      const name = entries.getNext();
      if (name.endsWith("/")) {
        continue;
      }
      const parts = name.split("/").filter(Boolean);
      if (parts.length === 0) {
        continue;
      }
      let parent = new File(destDir);
      for (let i = 0; i < parts.length - 1; i++) {
        parent.append(parts[i]);
        if (!parent.exists()) {
          parent.create(parent.DIRECTORY_TYPE, 0o755);
        }
      }
      const outFile = parent.clone();
      outFile.append(parts[parts.length - 1]);
      zr.extract(name, outFile);
    }
  } finally {
    zr.close();
  }
}

async function resolveProviderDir(extractedRoot: string): Promise<string> {
  try {
    await readTextFile(joinPaths(extractedRoot, "manifest.json"));
    return extractedRoot;
  } catch {
    /* not flat */
  }
  const subs = await listProviderSubdirectories(extractedRoot);
  if (subs.length === 1) {
    try {
      await readTextFile(joinPaths(subs[0], "manifest.json"));
      return subs[0];
    } catch {
      /* */
    }
  }
  throw new Error(
    "Invalid zip: expected manifest.json at root or a single subdirectory containing manifest.json",
  );
}

/**
 * Install provider from a local .zip path. Returns installed provider id.
 */
export async function installProviderFromZipFile(zipPath: string): Promise<string> {
  const root = getUserProvidersRoot();
  await ensureDirectory(root);
  const tmp = joinPaths(root, `._install_${Date.now()}`);
  await ensureDirectory(tmp);
  try {
    unzipToDirectory(zipPath, tmp);
    const srcDir = await resolveProviderDir(tmp);
    const manifestText = await readTextFile(joinPaths(srcDir, "manifest.json"));
    const manifest = parseProviderManifest(manifestText);
    await readTextFile(joinPaths(srcDir, "provider.js"));

    const { File } = getFileUtils();
    const target = joinPaths(root, manifest.id);
    await removePath(target, true);

    const src = new File(srcDir);
    const parent = new File(root);
    src.copyTo(parent, manifest.id);
    return manifest.id;
  } finally {
    await removePath(tmp, true);
  }
}

export async function removeUserProvider(id: string): Promise<void> {
  const root = getUserProvidersRoot();
  const dir = joinPaths(root, id);
  await removePath(dir, true);
}

export function pickZipFile(window: Window): Promise<string | null> {
  return new Promise((resolve) => {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window.browsingContext, "Select provider package (.zip)", Ci.nsIFilePicker.modeOpen);
    fp.appendFilter("ZIP", "*.zip");
    fp.open((result: number) => {
      if (result !== Ci.nsIFilePicker.returnOK || !fp.file) {
        resolve(null);
        return;
      }
      resolve(fp.file.path);
    });
  });
}
