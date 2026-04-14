import type { PluggableProviderImpl, ProviderAPI } from "../_sdk/types";
import type { ProviderManifest } from "../_sdk/types";
import type { SearchOptions, SearchResult } from "../../models/types";

function sanitizeSearchResult(result: SearchResult): SearchResult {
  try {
    return JSON.parse(JSON.stringify(result)) as SearchResult;
  } catch {
    return result;
  }
}

function cloneResultIntoSandbox<T>(Cu: any, sandbox: any, value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  try {
    return Cu.cloneInto(value, sandbox) as T;
  } catch {
    return value;
  }
}

function injectApiIntoSandbox(Cu: any, sandbox: any, api: ProviderAPI): void {
  const sandboxApi = Cu.createObjectIn(sandbox);
  sandbox.api = sandboxApi;

  const defineNamespace = (parent: any, key: string) => {
    const namespace = Cu.createObjectIn(sandbox);
    parent[key] = namespace;
    return namespace;
  };

  const exportSync = <Args extends unknown[], Result>(
    parent: any,
    key: string,
    fn: (...args: Args) => Result,
  ) => {
    Cu.exportFunction(
      (...args: Args) => cloneResultIntoSandbox(Cu, sandbox, fn(...args)),
      parent,
      { defineAs: key },
    );
  };

  const exportAsync = <Args extends unknown[], Result>(
    parent: any,
    key: string,
    fn: (...args: Args) => Promise<Result>,
  ) => {
    Cu.exportFunction(
      async (...args: Args) => cloneResultIntoSandbox(Cu, sandbox, await fn(...args)),
      parent,
      { defineAs: key },
    );
  };

  const http = defineNamespace(sandboxApi, "http");
  exportAsync(http, "get", api.http.get);
  exportAsync(http, "post", api.http.post);

  const xml = defineNamespace(sandboxApi, "xml");
  exportSync(xml, "parse", api.xml.parse);
  exportSync(xml, "getText", api.xml.getText);
  exportSync(xml, "getTextAll", api.xml.getTextAll);
  exportSync(xml, "getElements", api.xml.getElements);
  exportSync(xml, "getAttribute", api.xml.getAttribute);

  const dom = defineNamespace(sandboxApi, "dom");
  exportSync(dom, "parseHTML", api.dom.parseHTML);

  const config = defineNamespace(sandboxApi, "config");
  exportSync(config, "getString", api.config.getString);
  exportSync(config, "getNumber", api.config.getNumber);
  exportSync(config, "getBool", api.config.getBool);

  exportSync(sandboxApi, "getGlobalPref", api.getGlobalPref);
  exportSync(sandboxApi, "getGlobalPrefNumber", api.getGlobalPrefNumber);
  exportSync(sandboxApi, "getGlobalPrefBool", api.getGlobalPrefBool);

  const log = defineNamespace(sandboxApi, "log");
  exportSync(log, "debug", api.log.debug);
  exportSync(log, "info", api.log.info);
  exportSync(log, "warn", api.log.warn);
  exportSync(log, "error", api.log.error);

  const rateLimit = defineNamespace(sandboxApi, "rateLimit");
  exportAsync(rateLimit, "acquire", api.rateLimit.acquire);
}

/**
 * Evaluate provider bundle in a Gecko sandbox and invoke createProvider(api).
 */
export function invokeProviderFactory(
  bundleCode: string,
  manifest: ProviderManifest,
  api: ProviderAPI,
): PluggableProviderImpl {
  const Cu = Components.utils as any;

  const sandboxOptions: Record<string, unknown> = {
    sandboxName: `zrs-provider-${manifest.id}`,
    wantGlobalProperties: ["URL", "URLSearchParams", "TextEncoder", "TextDecoder", "DOMParser"],
    wantComponents: false,
  };

  const sandbox = Cu.Sandbox(null, sandboxOptions);

  try {
    Cu.evalInSandbox(bundleCode, sandbox, {
      filename: `provider-${manifest.id}.js`,
      lineNumber: 1,
    });
  } catch (e) {
    throw new Error(
      `Provider eval failed (${manifest.id}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const exp = sandbox.__zrs_exports as
    | { createProvider?: (a: ProviderAPI) => PluggableProviderImpl }
    | undefined;
  if (!exp || typeof exp.createProvider !== "function") {
    throw new Error(`Missing __zrs_exports.createProvider in bundle: ${manifest.id}`);
  }

  try {
    injectApiIntoSandbox(Cu, sandbox, api);
  } catch (e) {
    throw new Error(
      `sandbox API injection failed (${manifest.id}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let impl: PluggableProviderImpl;
  try {
    impl = Cu.evalInSandbox("__zrs_exports.createProvider(api)", sandbox, {
      filename: `provider-${manifest.id}-init.js`,
      lineNumber: 1,
    }) as PluggableProviderImpl;
  } catch (e) {
    throw new Error(
      `createProvider() failed (${manifest.id}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!impl || typeof impl.search !== "function") {
    throw new Error(`createProvider must return { search() } (${manifest.id})`);
  }

  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      const raw = await impl.search(query, options);
      return sanitizeSearchResult(raw);
    },
  };
}
