import type {
  PatentDetailResult,
  ResourceItem,
  SearchOptions,
  SearchResult,
} from "../../models/types";

/** HTTP response from provider HTTP helpers */
export interface ProviderHttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface ProviderHttpRequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
  withCredentials?: boolean;
}

/**
 * Injected API available inside sandboxed provider bundles.
 * Implementations live in chrome; providers only receive this object.
 */
export interface ProviderAPI {
  http: {
    get<T = unknown>(
      url: string,
      options?: ProviderHttpRequestOptions,
    ): Promise<ProviderHttpResponse<T>>;
    post<T = unknown>(
      url: string,
      body?: string | Record<string, unknown>,
      options?: { headers?: Record<string, string>; timeout?: number; withCredentials?: boolean },
    ): Promise<ProviderHttpResponse<T>>;
  };
  xml: {
    parse(xml: string): Document;
    getText(doc: Document | Element, tag: string): string | null;
    getTextAll(doc: Document | Element, tag: string): string[];
    getElements(parent: Document | Element, tag: string): Element[];
    getAttribute(el: Element, name: string): string | null;
  };
  dom: {
    parseHTML(html: string): Document;
  };
  /** Keys are relative to `platform.<providerId>.` (e.g. "enabled", "maxResults") */
  config: {
    getString(key: string, defaultValue?: string): string;
    getNumber(key: string, defaultValue?: number): number;
    getBool(key: string, defaultValue?: boolean): boolean;
  };
  /**
   * Read global prefs (api.*, general.*, etc.) only when allowed by manifest `allowedGlobalPrefs`.
   */
  getGlobalPref(key: string, defaultValue?: string): string;
  getGlobalPrefNumber(key: string, defaultValue?: number): number;
  getGlobalPrefBool(key: string, defaultValue?: boolean): boolean;
  log: {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  };
  rateLimit: {
    acquire(): Promise<void>;
  };
}

/** What a provider bundle must return from createProvider(api) */
export interface PluggableProviderImpl {
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  getDetail?(sourceId: string, options?: Record<string, unknown>): Promise<PatentDetailResult>;
}

export type ProviderFactory = (api: ProviderAPI) => PluggableProviderImpl;

/** Parsed manifest.json for a provider package */
export interface ProviderManifest {
  id: string;
  name: string;
  version: string;
  sourceType: "web" | "academic" | "patent";
  description?: string;
  author?: string;
  help?: ProviderUsageHelp;
  minPluginVersion?: string;
  permissions: {
    urls: string[];
  };
  configSchema?: Record<string, ProviderConfigFieldSchema>;
  /** Optional hard limit used when UI/config requests `maxResults = -1`. */
  maxResultsLimit?: number;
  /** Optional: requests per minute for api.rateLimit (default 60) */
  rateLimitPerMinute?: number;
  /** Search timeout in ms (default 60000) */
  searchTimeoutMs?: number;
  /** Allow reading these full pref keys (e.g. api.pubmed.key) */
  allowedGlobalPrefs?: string[];
  /** Optional integrity sha256 of provider.js (for remote installs) */
  integrity?: { sha256?: string };
}

export interface ProviderConfigFieldSchema {
  type: "boolean" | "string" | "number";
  default?: boolean | string | number;
  enum?: string[];
  label?: string;
  labelZh?: string;
  description?: string;
  advanced?: boolean;
  placeholder?: string;
  secret?: boolean;
  min?: number;
  max?: number;
}

export interface ProviderHelpExample {
  title?: string;
  titleZh?: string;
  description?: string;
  descriptionZh?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
}

export interface ProviderUsageHelp {
  summary?: string;
  summaryZh?: string;
  notes?: string[];
  notesZh?: string[];
  examples?: ProviderHelpExample[];
}

export interface LoadedProviderSource {
  kind: "user";
  path: string;
}

export type { ResourceItem, SearchOptions, SearchResult };
