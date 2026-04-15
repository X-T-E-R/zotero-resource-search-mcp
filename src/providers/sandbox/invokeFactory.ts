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
    Cu.exportFunction((...args: Args) => cloneResultIntoSandbox(Cu, sandbox, fn(...args)), parent, {
      defineAs: key,
    });
  };

  const exportAsync = <Args extends unknown[], Result>(
    parent: any,
    key: string,
    fn: (...args: Args) => Promise<Result>,
  ) => {
    const sandboxPromise = sandbox.Promise as PromiseConstructor;
    Cu.exportFunction(
      (...args: Args) => {
        const executor = Cu.exportFunction(
          (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
            void fn(...args)
              .then((result) => {
                try {
                  resolve(cloneResultIntoSandbox(Cu, sandbox, sanitizeResult(result)));
                } catch (error) {
                  reject(error instanceof Error ? error.message : String(error));
                }
              })
              .catch((error) => {
                reject(error instanceof Error ? error.message : String(error));
              });
          },
          sandbox,
        );
        return new sandboxPromise(executor);
      },
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

function buildProviderMethodEvalSource(method: "search" | "getDetail", callKey: string): string {
  return `(async () => {
const callState = globalThis["${callKey}"];
if (!callState || !callState.bridge) {
  throw new Error("Missing sandbox call bridge");
}
const bridge = callState.bridge;
const arg0 = callState.arg0;
const arg1 = callState.arg1;
const provider = globalThis.__zrs_provider;
try {
  const result = await provider.${method}(arg0, arg1);
  const serialized = typeof result === "undefined" ? "null" : JSON.stringify(result);
  bridge.resolve(serialized);
} catch (error) {
  const message =
    error && typeof error === "object" && "message" in error
      ? error.message
      : String(error);
  bridge.reject(String(message));
} finally {
  try {
    delete globalThis["${callKey}"];
  } catch {
    globalThis["${callKey}"] = undefined;
  }
}
})();`;
}

function invokeProviderMethod<T>(
  Cu: any,
  sandbox: any,
  manifest: ProviderManifest,
  method: "search" | "getDetail",
  arg0: unknown,
  arg1: unknown,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const callKey = `__zrs_call_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const settle = (callback: (value: any) => void, value: any) => {
      if (settled) return;
      settled = true;
      try {
        callback(value);
      } finally {
        try {
          delete sandbox[callKey];
        } catch {
          try {
            sandbox[callKey] = undefined;
          } catch {
            /* ignore cleanup failures */
          }
        }
      }
    };

    const bridge = Cu.createObjectIn(sandbox);
    Cu.exportFunction(
      (serialized: string) => {
        try {
          const parsed = JSON.parse(serialized) as T;
          settle(resolve, sanitizeResult(parsed));
        } catch {
          settle(reject, new Error(`Failed to decode ${method} result for ${manifest.id}`));
        }
      },
      bridge,
      { defineAs: "resolve" },
    );
    Cu.exportFunction(
      (message: unknown) => {
        settle(reject, new Error(String(message)));
      },
      bridge,
      { defineAs: "reject" },
    );

    const callState = Cu.createObjectIn(sandbox);
    callState.bridge = bridge;
    callState.arg0 = cloneResultIntoSandbox(Cu, sandbox, arg0);
    callState.arg1 = cloneResultIntoSandbox(Cu, sandbox, arg1);
    sandbox[callKey] = callState;

    try {
      Cu.evalInSandbox(buildProviderMethodEvalSource(method, callKey), sandbox, {
        filename: `provider-${manifest.id}-${method}.js`,
        lineNumber: 1,
      });
    } catch (error) {
      settle(
        reject,
        new Error(
          `${method}() failed (${manifest.id}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }
  });
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
    throw new Error(`createProvider() failed (${manifest.id}): ${message}`);
  }

  if (!implMeta?.hasSearch) {
    throw new Error(`createProvider must return { search() } (${manifest.id})`);
  }

  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      return invokeProviderMethod<SearchResult>(Cu, sandbox, manifest, "search", query, options);
    },
    async getDetail(
      sourceId: string,
      options?: Record<string, unknown>,
    ): Promise<PatentDetailResult> {
      if (!implMeta?.hasGetDetail) {
        throw new Error(`Provider ${manifest.id} does not implement getDetail()`);
      }
      return invokeProviderMethod<PatentDetailResult>(
        Cu,
        sandbox,
        manifest,
        "getDetail",
        sourceId,
        options,
      );
    },
  };
}
