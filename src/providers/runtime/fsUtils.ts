/**
 * File system helpers using Gecko IOUtils / OS (Zotero 7 / Firefox 115+).
 */

function getChromeUtils(): typeof ChromeUtils {
  return (globalThis as unknown as { ChromeUtils: typeof ChromeUtils }).ChromeUtils;
}

function getOS(): {
  Path: { join: (...parts: string[]) => string; basename: (path: string) => string };
} {
  const mod = getChromeUtils().importESModule("resource://gre/modules/OS.sys.mjs") as {
    OS: { Path: { join: (...parts: string[]) => string; basename: (path: string) => string } };
  };
  return mod.OS;
}

type IOUtilsType = {
  mkdir: (path: string, opts?: { create?: boolean }) => Promise<void>;
  read: (path: string) => Promise<Uint8Array>;
  write: (path: string, data: Uint8Array) => Promise<void>;
  remove: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
  readDirectory?: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ type: string }>;
};

function getIOUtils(): IOUtilsType {
  return getChromeUtils().importESModule("resource://gre/modules/IOUtils.sys.mjs") as IOUtilsType;
}

export function getUserProvidersRoot(): string {
  const profD = Services.dirsvc.get("ProfD", Ci.nsIFile);
  const OS = getOS();
  return OS.Path.join(profD.path, "zotero-resource-search", "providers");
}

export async function ensureDirectory(path: string): Promise<void> {
  const IOUtils = getIOUtils();
  await IOUtils.mkdir(path, { create: true });
}

export function joinPaths(...parts: string[]): string {
  return getOS().Path.join(...parts);
}

export function basename(path: string): string {
  return getOS().Path.basename(path);
}

export async function listProviderSubdirectories(root: string): Promise<string[]> {
  const IOUtils = getIOUtils();
  await ensureDirectory(root);
  let names: string[];
  try {
    if (typeof IOUtils.readDirectory === "function") {
      names = await IOUtils.readDirectory(root);
    } else {
      return listSubdirsNsIFile(root);
    }
  } catch {
    return listSubdirsNsIFile(root);
  }
  const OS = getOS();
  const dirs: string[] = [];
  for (const name of names) {
    const full = OS.Path.join(root, name);
    try {
      const st = await IOUtils.stat(full);
      if (st.type === "directory") {
        dirs.push(full);
      }
    } catch {
      /* skip */
    }
  }
  return dirs;
}

/** Fallback directory listing using nsIFile (sync). */
function listSubdirsNsIFile(root: string): string[] {
  const FileUtils = getChromeUtils().importESModule("resource://gre/modules/FileUtils.sys.mjs") as {
    File: new (path: string) => {
      exists: () => boolean;
      isDirectory: () => boolean;
      DIRECTORY_TYPE: number;
      create: (t: number, perm: number) => void;
      directoryEntries: {
        hasMoreElements: () => boolean;
        getNext: () => { QueryInterface: (i: unknown) => any };
      };
    };
  };
  const dir = new FileUtils.File(root);
  if (!dir.exists()) {
    dir.create(dir.DIRECTORY_TYPE, 0o755);
  }
  if (!dir.isDirectory()) {
    return [];
  }
  const out: string[] = [];
  const entries = dir.directoryEntries;
  while (entries.hasMoreElements()) {
    const f = entries.getNext().QueryInterface(Ci.nsIFile);
    if (f.isDirectory()) {
      out.push(f.path);
    }
  }
  return out;
}

export async function readTextFile(path: string): Promise<string> {
  const IOUtils = getIOUtils();
  const buf = await IOUtils.read(path);
  return new TextDecoder("utf-8").decode(buf);
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const IOUtils = getIOUtils();
  return IOUtils.read(path);
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  const IOUtils = getIOUtils();
  await IOUtils.write(path, data);
}

export async function removePath(path: string, recursive = true): Promise<void> {
  const IOUtils = getIOUtils();
  await IOUtils.remove(path, { recursive });
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
