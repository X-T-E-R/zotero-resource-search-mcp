import pkg from "../../../package.json";

export function getPluginVersion(): string {
  return pkg.version;
}

/** Loose semver: compare [major, minor, patch] numerically */
export function semverGte(version: string, minimum: string): boolean {
  const pa = version
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  const pb = minimum
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const a = pa[i] ?? 0;
    const b = pb[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export function assertMinPluginVersion(min?: string): void {
  if (!min) return;
  const cur = getPluginVersion();
  if (!semverGte(cur, min)) {
    throw new Error(`Requires plugin version >= ${min}, current ${cur}`);
  }
}
