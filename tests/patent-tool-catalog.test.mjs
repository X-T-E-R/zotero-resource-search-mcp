import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("patent tools expose detail sync and add payload options", async () => {
  const mod = await loadTsModule("src/mcp/toolCatalog.ts");
  const tools = mod.cloneToolSchemas();

  const patentDetail = tools.find((tool) => tool.name === "patent_detail");
  assert.ok(patentDetail, "patent_detail schema should exist");
  assert.ok(patentDetail.inputSchema.properties.addToLibrary);
  assert.ok(patentDetail.inputSchema.properties.fetchPDF);

  const resourceAdd = tools.find((tool) => tool.name === "resource_add");
  assert.ok(resourceAdd, "resource_add schema should exist");
  assert.ok(resourceAdd.inputSchema.properties.detail);
  assert.ok(resourceAdd.inputSchema.properties.fetchPDF);
});
