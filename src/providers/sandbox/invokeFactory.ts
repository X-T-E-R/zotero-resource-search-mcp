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
    sandbox.api = Cu.cloneInto(api, sandbox, { cloneFunctions: true });
  } catch (e) {
    throw new Error(
      `cloneInto(api) failed (${manifest.id}): ${e instanceof Error ? e.message : String(e)}`,
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
