import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("createHelpSnapshot can focus a concrete web backend provider", async () => {
  globalThis.Zotero = {
    locale: "en-US",
    debug() {},
    Prefs: {
      get() {
        return undefined;
      },
    },
  };

  const mod = await loadTsModule("src/mcp/helpCatalog.ts");
  const snapshot = mod.createHelpSnapshot({ provider: "tavily", locale: "en" });

  assert.equal(snapshot.providers.length, 1);
  assert.equal(snapshot.providers[0].id, "tavily");
  assert.match(snapshot.providers[0].summary, /web|news|search/i);
});
