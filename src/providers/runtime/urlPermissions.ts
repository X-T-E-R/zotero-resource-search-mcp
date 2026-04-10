/**
 * Match a URL against manifest permission patterns like https://host/path/*
 */
export function urlMatchesPermission(url: string, pattern: string): boolean {
  try {
    const u = new URL(url);
    const p = pattern.trim();
    if (!/^https?:\/\//i.test(p)) {
      return false;
    }
    const escaped = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i").test(url);
  } catch {
    return false;
  }
}

export function assertUrlAllowed(url: string, patterns: string[]): void {
  if (!patterns.some((pat) => urlMatchesPermission(url, pat))) {
    throw new Error(`URL not allowed by provider manifest: ${url}`);
  }
}
