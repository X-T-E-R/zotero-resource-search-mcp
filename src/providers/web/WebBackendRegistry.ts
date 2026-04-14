import type { WebBackend } from "./WebBackend";

/**
 * Registry for built-in web backends. User-extensible web packages are a future option;
 * today all backends are registered in {@link registerBuiltinWebBackends}.
 */
class WebBackendRegistry {
  private backends = new Map<string, WebBackend>();

  clear(): void {
    this.backends.clear();
  }

  register(backend: WebBackend): void {
    this.backends.set(backend.id, backend);
  }

  get(id: string): WebBackend | undefined {
    return this.backends.get(id);
  }

  getAll(): WebBackend[] {
    return [...this.backends.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getConfigured(): WebBackend[] {
    return this.getAll().filter((b) => b.isConfigured());
  }

  /** True if any backend reports configured (credentials + enabled) */
  hasAny(): boolean {
    return this.getAll().some((b) => b.isConfigured());
  }
}

export const webBackendRegistry = new WebBackendRegistry();
