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

  // src/providers/packages/wos/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });
  var BASE = "https://api.clarivate.com/apis/wos-starter/v2";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        const key = api.getGlobalPref("api.wos.key");
        if (!key) {
          throw new Error("Web of Science API key required (api.wos.key)");
        }
        const maxResults = Math.min(options?.maxResults ?? 25, 50);
        const page = options?.page ?? 1;
        await api.rateLimit.acquire();
        const q = buildQuery(query, options);
        const sortField = mapSortField(options?.sortBy ?? "citations");
        const database = options?.extra?.database || api.config.getString("database", "WOS");
        const params = {
          q,
          db: database,
          limit: maxResults,
          page
        };
        if (sortField) {
          params.sortField = `${sortField} DESC`;
        }
        const response = await api.http.get(`${BASE}/documents`, {
          params,
          headers: { "X-ApiKey": key }
        });
        const hits = response.data.hits ?? [];
        const total = response.data.metadata?.total ?? 0;
        const items = [];
        for (const hit of hits) {
          const item = parseRecord(api, hit);
          if (item) items.push(item);
        }
        return {
          platform: "wos",
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
  function buildQuery(query, options) {
    const parts = [];
    const fieldTags = ["TS=", "TI=", "AU=", "SO=", "DO=", "PY="];
    const hasTag = fieldTags.some((t) => query.toUpperCase().includes(t));
    if (hasTag) {
      parts.push(query);
    } else {
      parts.push(`TS=(${escapeQuery(query)})`);
    }
    if (options?.year) {
      if (options.year.includes("-")) {
        const [start, end] = options.year.split("-");
        parts.push(`PY=(${start.trim()}-${end.trim()})`);
      } else {
        parts.push(`PY=${options.year}`);
      }
    }
    if (options?.author) {
      parts.push(`AU=(${escapeQuery(options.author)})`);
    }
    return parts.join(" AND ");
  }
  function escapeQuery(value) {
    return value.replace(/['"\\]/g, "");
  }
  function mapSortField(sortBy) {
    switch (sortBy) {
      case "date":
        return "PD";
      case "citations":
        return "TC";
      case "relevance":
        return "relevance";
      default:
        return void 0;
    }
  }
  function parseRecord(api, rec) {
    try {
      const title = rec.title ?? "Untitled";
      const doi = rec.identifiers?.doi ?? "";
      const year = rec.source?.publishYear;
      const authors = rec.names?.authors ?? [];
      const creators = authors.map((a) => {
        const displayName = a.displayName ?? "";
        return splitAuthorName(displayName);
      });
      const date = year ? `${year}` : void 0;
      const citationCount = rec.citations?.[0]?.citingArticlesCount ?? rec.citations?.[0]?.count ?? 0;
      const extraParts = [];
      if (rec.uid) extraParts.push(`WOS UT: ${rec.uid}`);
      if (citationCount > 0) {
        extraParts.push(`Citations: ${citationCount}`);
      }
      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: rec.abstract ?? void 0,
        date,
        DOI: doi || void 0,
        url: `https://www.webofscience.com/wos/woscc/full-record/${rec.uid}`,
        publicationTitle: rec.source?.sourceTitle ?? void 0,
        extra: extraParts.length > 0 ? extraParts.join("\n") : void 0,
        source: "wos",
        citationCount
      };
    } catch (error) {
      api.log.warn("Failed to parse WoS record", error);
      return null;
    }
  }
  function splitAuthorName(displayName) {
    const commaIdx = displayName.indexOf(",");
    if (commaIdx > 0) {
      const lastName2 = displayName.substring(0, commaIdx).trim();
      const firstName2 = displayName.substring(commaIdx + 1).trim();
      return { firstName: firstName2 || void 0, lastName: lastName2, creatorType: "author" };
    }
    const parts = displayName.trim().split(/\s+/);
    if (parts.length <= 1) {
      return { lastName: displayName.trim(), creatorType: "author" };
    }
    const lastName = parts.pop();
    const firstName = parts.join(" ");
    return { firstName, lastName, creatorType: "author" };
  }
  return __toCommonJS(index_exports);
})();
