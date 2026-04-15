import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("resolveWorkspaceSourceStatus prioritizes disabled before configuration state", async () => {
  const mod = await loadTsModule("src/workspace/sourceStatus.ts");

  const result = mod.resolveWorkspaceSourceStatus("zh", false, false, false);
  assert.equal(result.kind, "disabled");
  assert.equal(result.text, "已禁用");
});

test("resolveWorkspaceSourceStatus returns verified only for enabled and configured sources", async () => {
  const mod = await loadTsModule("src/workspace/sourceStatus.ts");

  const verified = mod.resolveWorkspaceSourceStatus("en", true, true, true);
  assert.equal(verified.kind, "verified");
  assert.equal(verified.text, "Verified");

  const missing = mod.resolveWorkspaceSourceStatus("en", true, false, true);
  assert.equal(missing.kind, "missing");
  assert.equal(missing.text, "Needs config");
});
