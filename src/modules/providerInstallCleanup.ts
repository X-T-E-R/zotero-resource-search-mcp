export interface ProviderInstallCleanupOps {
  removePath(path: string, recursive?: boolean): Promise<void>;
  makePathWritable(path: string, recursive?: boolean): Promise<void>;
}

export function isReadonlyDeleteFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return (
    normalized.includes("read only") ||
    normalized.includes("readonly") ||
    normalized.includes("access denied") ||
    normalized.includes("access rights") ||
    normalized.includes("ns_error_file_access_denied") ||
    normalized.includes("拒绝访问")
  );
}

export async function removeInstallPath(
  path: string,
  ops: ProviderInstallCleanupOps,
  recursive = true,
): Promise<void> {
  try {
    await ops.removePath(path, recursive);
  } catch (error) {
    if (!isReadonlyDeleteFailure(error)) {
      throw error;
    }
    await ops.makePathWritable(path, recursive);
    await ops.removePath(path, recursive);
  }
}
