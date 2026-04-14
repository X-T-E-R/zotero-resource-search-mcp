/**
 * Built-in web search backends (Tavily, Firecrawl, etc.) implement this interface.
 * They are registered in {@link webBackendRegistry} at startup.
 */
export type WebBackendCapability = "search" | "extract";

export interface WebBackendConfigField {
  /** Relative to `web.<backendId>.` unless `fullPrefKey` is set */
  key: string;
  label: string;
  labelZh?: string;
  type: "text" | "password" | "select" | "checkbox";
  placeholder?: string;
  options?: { value: string; label: string }[];
  advanced?: boolean;
  /** When set, read/write this full pref key (e.g. shared API keys) */
  fullPrefKey?: string;
}

export interface WebBackend {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly descriptionZh?: string;
  /** Search and/or URL extraction (scrape) support */
  readonly capabilities: ReadonlySet<WebBackendCapability>;
  readonly configSchema: WebBackendConfigField[];
  isEnabled(): boolean;
  hasRequiredConfig(): boolean;
  /** Backend is enabled in prefs and has required credentials */
  isConfigured(): boolean;
}
