import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("github repository URL expands to release-first registry candidates", async () => {
  const mod = await loadTsModule("src/modules/providerRegistryUrl.ts");
  const candidates = mod.expandRegistryUrlCandidates(
    "https://github.com/X-T-E-R/resource-search-providers",
  );

  assert.deepEqual(candidates, [
    "https://github.com/X-T-E-R/resource-search-providers/releases/download/providers-registry-latest/registry.json",
    "https://github.com/X-T-E-R/resource-search-providers/releases/latest/download/registry.json",
    "https://raw.githubusercontent.com/X-T-E-R/resource-search-providers/main/registry.json",
    "https://raw.githubusercontent.com/X-T-E-R/resource-search-providers/master/registry.json",
  ]);
});

test("direct registry JSON URL stays unchanged", async () => {
  const mod = await loadTsModule("src/modules/providerRegistryUrl.ts");
  const url = "https://example.com/custom/registry.json";
  const candidates = mod.expandRegistryUrlCandidates(url);

  assert.deepEqual(candidates, [url]);
});
