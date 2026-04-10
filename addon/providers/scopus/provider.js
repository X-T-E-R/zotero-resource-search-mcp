"use strict";
var __zrs_exports = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/providers/packages/scopus/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });
  var BASE = "https://api.elsevier.com";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        const apiKey = api.getGlobalPref("api.elsevier.key");
        if (!apiKey) {
          throw new Error("Elsevier API key required for Scopus");
        }
        const maxResults = Math.min(options?.maxResults ?? 10, 25);
        const page = options?.page ?? 1;
        await api.rateLimit.acquire();
        let searchQuery = `TITLE-ABS-KEY(${query})`;
        if (options?.author) searchQuery += ` AND AUTHOR(${options.author})`;
        if (options?.year) {
          if (options.year.includes("-")) {
            const [start, end] = options.year.split("-");
            searchQuery += ` AND PUBYEAR > ${parseInt(start) - 1}`;
            if (end) searchQuery += ` AND PUBYEAR < ${parseInt(end) + 1}`;
          } else {
            searchQuery += ` AND PUBYEAR = ${options.year}`;
          }
        }
        const sortMapping = {
          relevance: "relevancy",
          date: "-coverDate",
          citations: "-citedby-count"
        };
        const headers = {
          "X-ELS-APIKey": apiKey,
          Accept: "application/json"
        };
        const response = await api.http.get(`${BASE}/content/search/scopus`, {
          params: {
            query: searchQuery,
            count: maxResults,
            start: (page - 1) * maxResults,
            sort: sortMapping[options?.sortBy ?? "relevance"] ?? "relevancy"
          },
          headers
        });
        const entries = response.data["search-results"]?.entry ?? [];
        const total = parseInt(
          response.data["search-results"]?.["opensearch:totalResults"] ?? "0",
          10
        );
        const items = [];
        for (const entry of entries) {
          if (entry["@_fa"] === "true" || entry["error"]) continue;
          const item = parseEntry(entry);
          if (item) items.push(item);
        }
        return {
          platform: "scopus",
          query,
          totalResults: total,
          items,
          page,
          elapsed: Date.now() - startTime,
          hasMore: total > page * maxResults
        };
      }
    };
  }
  function parseEntry(entry) {
    try {
      const title = entry["dc:title"] ?? "Untitled";
      const doi = entry["prism:doi"] ?? "";
      const creator = entry["dc:creator"] ?? "";
      const coverDate = entry["prism:coverDate"] ?? "";
      const citedBy = parseInt(entry["citedby-count"] ?? "0", 10);
      const creators = [];
      if (creator) {
        const parts = creator.split(",").map((s) => s.trim());
        if (parts.length >= 2) {
          creators.push({
            lastName: parts[0],
            firstName: parts.slice(1).join(" "),
            creatorType: "author"
          });
        } else {
          creators.push({ lastName: creator, creatorType: "author" });
        }
      }
      const extraParts = [];
      if (entry.eid) extraParts.push(`EID: ${entry.eid}`);
      if (citedBy > 0) extraParts.push(`Citations: ${citedBy}`);
      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: entry["dc:description"] || void 0,
        date: coverDate || void 0,
        DOI: doi || void 0,
        url: doi ? `https://doi.org/${doi}` : entry.link?.[0]?.["@href"] ?? void 0,
        publicationTitle: entry["prism:publicationName"] ?? void 0,
        volume: entry["prism:volume"] ?? void 0,
        issue: entry["prism:issueIdentifier"] ?? void 0,
        extra: extraParts.length > 0 ? extraParts.join("\n") : void 0,
        source: "scopus",
        citationCount: citedBy
      };
    } catch {
      return null;
    }
  }
  return __toCommonJS(index_exports);
})();
