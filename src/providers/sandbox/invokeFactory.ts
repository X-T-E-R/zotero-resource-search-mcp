import type { PluggableProviderImpl, ProviderAPI } from "../_sdk/types";
import type { ProviderManifest } from "../_sdk/types";
import type { PatentDetailResult, SearchOptions, SearchResult } from "../../models/types";

function sanitizeResult<T>(result: T): T {
  try {
    return JSON.parse(JSON.stringify(result)) as T;
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

function buildProviderInitEvalSource(bundleCode: string): string {
  return `(() => {
${bundleCode}
const exp =
  typeof __zrs_exports !== "undefined"
    ? __zrs_exports
    : typeof globalThis !== "undefined"
      ? globalThis.__zrs_exports
      : undefined;
if (!exp || typeof exp.createProvider !== "function") {
  throw new Error("Missing __zrs_exports.createProvider");
}
globalThis.__zrs_provider = exp.createProvider(api);
return {
  hasSearch: !!globalThis.__zrs_provider && typeof globalThis.__zrs_provider.search === "function",
  hasGetDetail:
    !!globalThis.__zrs_provider && typeof globalThis.__zrs_provider.getDetail === "function"
};
})()`;
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
    injectApiIntoSandbox(Cu, sandbox, api);
  } catch (e) {
    throw new Error(
      `sandbox API injection failed (${manifest.id}): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let implMeta:
    | {
        hasSearch?: boolean;
        hasGetDetail?: boolean;
      }
    | undefined;
  try {
    implMeta = Cu.evalInSandbox(buildProviderInitEvalSource(bundleCode), sandbox, {
      filename: `provider-${manifest.id}.js`,
      lineNumber: 1,
    }) as { hasSearch?: boolean; hasGetDetail?: boolean } | undefined;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Missing __zrs_exports.createProvider")) {
      throw new Error(`Missing __zrs_exports.createProvider in bundle: ${manifest.id}`);
    }
    throw new Error(
      `createProvider() failed (${manifest.id}): ${message}`,
    );
  }

  if (!implMeta?.hasSearch) {
    throw new Error(`createProvider must return { search() } (${manifest.id})`);
  }

  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      sandbox.__zrs_query = cloneResultIntoSandbox(Cu, sandbox, query);
      sandbox.__zrs_options = cloneResultIntoSandbox(Cu, sandbox, options);
      const raw = (await Cu.evalInSandbox(
        "__zrs_provider.search(__zrs_query, __zrs_options)",
        sandbox,
        {
          filename: `provider-${manifest.id}-search.js`,
          lineNumber: 1,
        },
      )) as SearchResult;
      return sanitizeResult(raw);
    },
    async getDetail(
      sourceId: string,
      options?: Record<string, unknown>,
    ): Promise<PatentDetailResult> {
      if (!implMeta?.hasGetDetail) {
        throw new Error(`Provider ${manifest.id} does not implement getDetail()`);
      }
      sandbox.__zrs_sourceId = cloneResultIntoSandbox(Cu, sandbox, sourceId);
      sandbox.__zrs_detailOptions = cloneResultIntoSandbox(Cu, sandbox, options);
      const raw = (await Cu.evalInSandbox(
        "__zrs_provider.getDetail(__zrs_sourceId, __zrs_detailOptions)",
        sandbox,
        {
          filename: `provider-${manifest.id}-detail.js`,
          lineNumber: 1,
        },
      )) as PatentDetailResult;
      return sanitizeResult(raw) as PatentDetailResult;
    },
  };
}
