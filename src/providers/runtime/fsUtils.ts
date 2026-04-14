/**
 * File system helpers using Gecko IOUtils / OS (Zotero 7 / Firefox 115+).
 */

function getChromeUtils(): typeof ChromeUtils {
  return (globalThis as unknown as { ChromeUtils: typeof ChromeUtils }).ChromeUtils;
}

function getCu(): {
  import: <T = unknown>(url: string) => T;
} {
  return (Components.utils ?? {}) as { import: <T = unknown>(url: string) => T };
}

function newFile(path: string): nsIFile {
  const esm = importESModuleMaybe<{
    File: new (path: string) => nsIFile;
  }>("resource://gre/modules/FileUtils.sys.mjs");
  if (esm?.File) {
    return new esm.File(path);
  }

  const jsm = importJSMMaybe<{
    File: new (path: string) => nsIFile;
  }>("resource://gre/modules/FileUtils.jsm");
  if (jsm?.File) {
    return new jsm.File(path);
  }

  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  return file;
}

type PathModule = {
  join: (...parts: string[]) => string;
  basename: (path: string) => string;
};

function importESModuleMaybe<T>(url: string): T | undefined {
  try {
    return getChromeUtils().importESModule(url) as T;
  } catch {
    return undefined;
  }
}

function importJSMMaybe<T>(url: string): T | undefined {
  try {
    const Cu = getCu();
    if (typeof Cu.import !== "function") {
      return undefined;
    }
    return Cu.import<T>(url);
  } catch {
    return undefined;
  }
}

function getPathModule(): PathModule {
  const pathUtilsMod = importESModuleMaybe<{
    PathUtils: PathModule;
  }>("resource://gre/modules/PathUtils.sys.mjs");
  if (pathUtilsMod?.PathUtils) {
    return pathUtilsMod.PathUtils;
  }

  const osMod =
    importESModuleMaybe<{
      OS: { Path: PathModule };
    }>("resource://gre/modules/OS.sys.mjs") ??
    importJSMMaybe<{
      OS: { Path: PathModule };
    }>("resource://gre/modules/osfile.jsm");
  if (osMod?.OS?.Path) {
    return osMod.OS.Path;
  }

  const sep = Services.appinfo.OS === "WINNT" ? "\\" : "/";
  return {
    join: (...parts: string[]) =>
      parts
        .filter(Boolean)
        .map((part, index) =>
          index === 0 ? part.replace(/[\\/]+$/g, "") : part.replace(/^[\\/]+|[\\/]+$/g, ""),
        )
        .join(sep),
    basename: (path: string) => {
      const normalized = path.replace(/[\\/]+$/g, "");
      const segments = normalized.split(/[\\/]/);
      return segments[segments.length - 1] || "";
    },
  };
}

type IOUtilsType = {
  mkdir: (path: string, opts?: { create?: boolean; recursive?: boolean }) => Promise<void>;
  read: (path: string) => Promise<Uint8Array>;
  write: (path: string, data: Uint8Array) => Promise<void>;
  remove: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
  readDirectory?: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{ type: string }>;
};

function getIOUtils(): IOUtilsType | undefined {
  const esm = importESModuleMaybe<IOUtilsType>("resource://gre/modules/IOUtils.sys.mjs");
  if (esm) {
    return esm;
  }
  return importJSMMaybe<IOUtilsType>("resource://gre/modules/IOUtils.jsm");
}

export function getUserProvidersRoot(): string {
  const profD = Services.dirsvc.get("ProfD", Ci.nsIFile);
  return getPathModule().join(profD.path, "zotero-resource-search", "providers");
}

function ensureDirectoryNsIFile(path: string): void {
  const dir = newFile(path);
  if (dir.exists()) {
    if (!dir.isDirectory()) {
      throw new Error(`Path exists but is not a directory: ${path}`);
    }
    return;
  }
  const parent = dir.parent;
  if (parent && !parent.exists()) {
    ensureDirectoryNsIFile(parent.path);
  }
  dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
}

export async function ensureDirectory(path: string): Promise<void> {
  const IOUtils = getIOUtils();
  if (IOUtils) {
    try {
      await IOUtils.mkdir(path, { create: true, recursive: true });
      return;
    } catch {
      /* fall through */
    }
  }
  ensureDirectoryNsIFile(path);
}

export function joinPaths(...parts: string[]): string {
  return getPathModule().join(...parts);
}

export function basename(path: string): string {
  return getPathModule().basename(path);
}

export async function listProviderSubdirectories(root: string): Promise<string[]> {
  const IOUtils = getIOUtils();
  await ensureDirectory(root);
  if (IOUtils) {
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
    const Path = getPathModule();
    const dirs: string[] = [];
    for (const name of names) {
      const full = Path.join(root, name);
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
  return listSubdirsNsIFile(root);
}

/** Fallback directory listing using nsIFile (sync). */
function listSubdirsNsIFile(root: string): string[] {
  const dir = newFile(root) as nsIFile & {
    directoryEntries?: {
      hasMoreElements: () => boolean;
      getNext: () => unknown;
    };
  };
  if (!dir.exists()) {
    dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
  }
  if (!dir.isDirectory()) {
    return [];
  }
  const out: string[] = [];
  const entries = dir.directoryEntries;
  if (!entries) {
    return out;
  }
  while (entries.hasMoreElements()) {
    const f = coerceNsIFile(entries.getNext());
    if (f.isDirectory()) {
      out.push(f.path);
    }
  }
  return out;
}

export async function readTextFile(path: string): Promise<string> {
  const buf = await readBinaryFile(path);
  return new TextDecoder("utf-8").decode(buf);
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  const IOUtils = getIOUtils();
  if (IOUtils) {
    return IOUtils.read(path);
  }
  return readBinaryFileNsIFile(path);
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  const IOUtils = getIOUtils();
  if (IOUtils) {
    await IOUtils.write(path, data);
    return;
  }
  writeBinaryFileNsIFile(path, data);
}

export async function removePath(path: string, recursive = true): Promise<void> {
  const IOUtils = getIOUtils();
  if (IOUtils) {
    await IOUtils.remove(path, { recursive });
    return;
  }
  removePathNsIFile(path, recursive);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readBinaryFileNsIFile(path: string): Uint8Array {
  const file = newFile(path);
  const input = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
  const binary = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
  try {
    input.init(file, 0x01, 0o444, 0);
    binary.setInputStream(input);
    return Uint8Array.from(binary.readByteArray(binary.available()));
  } finally {
    try {
      binary.close();
    } catch {
      /* ignore */
    }
    try {
      input.close();
    } catch {
      /* ignore */
    }
  }
}

function writeBinaryFileNsIFile(path: string, data: Uint8Array): void {
  const file = newFile(path);
  const parent = file.parent;
  if (parent && !parent.exists()) {
    ensureDirectoryNsIFile(parent.path);
  }
  const output = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
  const binary = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(Ci.nsIBinaryOutputStream);
  try {
    output.init(file, 0x02 | 0x08 | 0x20, 0o644, 0);
    binary.setOutputStream(output);
    binary.writeByteArray(Array.from(data), data.length);
  } finally {
    try {
      binary.close();
    } catch {
      /* ignore */
    }
    try {
      output.close();
    } catch {
      /* ignore */
    }
  }
}

function removePathNsIFile(path: string, recursive: boolean): void {
  const file = newFile(path);
  if (!file.exists()) {
    return;
  }
  if (!recursive || !file.isDirectory()) {
    file.remove(false);
    return;
  }
  removeDirectoryRecursiveNsIFile(file);
}

function removeDirectoryRecursiveNsIFile(dir: nsIFile): void {
  const entries = (dir as nsIFile & {
    directoryEntries?: {
      hasMoreElements: () => boolean;
      getNext: () => unknown;
    };
  }).directoryEntries;
  if (entries) {
    while (entries.hasMoreElements()) {
      const child = coerceNsIFile(entries.getNext());
      if (child.isDirectory()) {
        removeDirectoryRecursiveNsIFile(child);
      } else {
        child.remove(false);
      }
    }
  }
  dir.remove(false);
}

function coerceNsIFile(value: unknown): nsIFile {
  const maybeFile = value as nsIFile & {
    QueryInterface?: (iface: unknown) => nsIFile;
  };
  try {
    return (maybeFile as { QueryInterface: (iface: unknown) => nsIFile }).QueryInterface(
      Ci.nsIFile,
    ) as nsIFile;
  } catch {
    return maybeFile;
  }
}
