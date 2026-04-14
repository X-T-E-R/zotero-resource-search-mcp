import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("empty academic provider state without registry URL asks user to configure repo link", async () => {
  const mod = await loadTsModule("src/providers/academicSourceGuidance.ts");
  const result = mod.getAcademicSourceGuidance({
    locale: "zh",
    academicProviderCount: 0,
    registryUrl: "",
  });

  assert.equal(result.needsAttention, true);
  assert.equal(result.action, "set-registry-url");
  assert.match(result.title, /未配置任何学术源/);
  assert.ok(result.details.some((line) => line.includes("源仓库 URL")));
});

test("empty academic provider state with registry URL asks user to pull providers", async () => {
  const mod = await loadTsModule("src/providers/academicSourceGuidance.ts");
  const result = mod.getAcademicSourceGuidance({
    locale: "en",
    academicProviderCount: 0,
    registryUrl: "https://example.com/providers.json",
  });

  assert.equal(result.needsAttention, true);
  assert.equal(result.action, "check-registry");
  assert.match(result.title, /No academic sources configured/);
  assert.ok(result.details.some((line) => line.includes("Check registry")));
});

test("loaded academic providers suppress onboarding warning", async () => {
  const mod = await loadTsModule("src/providers/academicSourceGuidance.ts");
  const result = mod.getAcademicSourceGuidance({
    locale: "en",
    academicProviderCount: 2,
    registryUrl: "",
  });

  assert.equal(result.needsAttention, false);
  assert.equal(result.action, "none");
  assert.equal(result.details.length, 0);
});
