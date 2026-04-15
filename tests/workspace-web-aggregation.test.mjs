import test from "node:test";
import assert from "node:assert/strict";

import { loadTsModule } from "./helpers/loadTsModule.mjs";

test("aggregateWebSearches keeps provider order and preserves partial failures", async () => {
  const mod = await loadTsModule("src/workspace/webAggregation.ts");

  const calls = [];
  const result = await mod.aggregateWebSearches({
    query: "graph neural networks",
    providers: ["tavily", "exa", "xai"],
    commonOptions: {
      maxResults: 5,
      includeContent: true,
      includeDomains: ["example.com"],
    },
    providerOptions: {
      tavily: { topic: "news", includeAnswer: false },
      xai: { sources: ["web", "x"] },
    },
    runProviderSearch: async (provider, payload) => {
      calls.push({ provider, payload });
      if (provider === "exa") {
        throw new Error("rate limited");
      }
      return {
        provider,
        query: payload.query,
        answer: provider === "tavily" ? "summary" : "",
        results: [{ provider, title: `${provider} result`, url: `https://${provider}.example` }],
        citations: [{ title: `${provider} cite`, url: `https://${provider}.example` }],
      };
    },
  });

  assert.deepEqual(
    calls.map((entry) => entry.provider),
    ["tavily", "exa", "xai"],
  );
  assert.equal(result.query, "graph neural networks");
  assert.equal(result.groups.length, 3);
  assert.deepEqual(
    result.groups.map((group) => ({
      provider: group.provider,
      resultCount: group.resultCount,
      error: group.error ?? null,
    })),
    [
      { provider: "tavily", resultCount: 1, error: null },
      { provider: "exa", resultCount: 0, error: "Error: rate limited" },
      { provider: "xai", resultCount: 1, error: null },
    ],
  );
  assert.equal(result.groups[0].answer, "summary");
  assert.deepEqual(result.groups[0].request.includeDomains, ["example.com"]);
  assert.equal(result.groups[0].request.topic, "news");
  assert.deepEqual(result.groups[2].request.sources, ["web", "x"]);
  assert.equal(result.summary.successCount, 2);
  assert.equal(result.summary.failureCount, 1);
});
