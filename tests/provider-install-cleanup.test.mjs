import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("removeInstallPath retries after clearing readonly files", async () => {
  const mod = await loadTsModule("src/modules/providerInstallCleanup.ts");

  const calls = [];
  let removeAttempts = 0;
  await mod.removeInstallPath("C:\\temp\\._install_123", {
    removePath: async (path, recursive) => {
      calls.push(["removePath", path, recursive]);
      removeAttempts += 1;
      if (removeAttempts === 1) {
        throw new Error(
          "You do not have sufficient access rights to perform this operation or the item is hidden, system, or read only.",
        );
      }
    },
    makePathWritable: async (path, recursive) => {
      calls.push(["makePathWritable", path, recursive]);
    },
  });

  assert.deepEqual(calls, [
    ["removePath", "C:\\temp\\._install_123", true],
    ["makePathWritable", "C:\\temp\\._install_123", true],
    ["removePath", "C:\\temp\\._install_123", true],
  ]);
});

test("removeInstallPath does not swallow unrelated delete failures", async () => {
  const mod = await loadTsModule("src/modules/providerInstallCleanup.ts");

  await assert.rejects(
    mod.removeInstallPath("C:\\temp\\provider", {
      removePath: async () => {
        throw new Error("network timeout");
      },
      makePathWritable: async () => {
        throw new Error("should not be called");
      },
    }),
    /network timeout/,
  );
});
