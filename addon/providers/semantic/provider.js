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

  // src/providers/packages/semantic/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });
  var BASE = "https://api.semanticscholar.org/graph/v1";
  var FIELDS = "paperId,title,abstract,venue,year,citationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,publicationDate,journal,authors,externalIds,url";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        const maxResults = Math.min(options?.maxResults ?? 10, 100);
        const page = options?.page ?? 1;
        await api.rateLimit.acquire();
        const apiKey = api.getGlobalPref("api.semanticScholar.key");
        const headers = {};
        if (apiKey) headers["x-api-key"] = apiKey;
        const params = {
          query,
          limit: maxResults,
          offset: (page - 1) * maxResults,
          fields: FIELDS
        };
        if (options?.year) params.year = options.year;
        if (options?.extra?.fieldsOfStudy) params.fieldsOfStudy = options.extra.fieldsOfStudy;
        const response = await api.http.get(`${BASE}/paper/search`, { params, headers });
        const data = response.data?.data ?? [];
        const total = response.data?.total ?? data.length;
        const items = [];
        for (const raw of data) {
          const item = parseItem(raw);
          if (item) items.push(item);
        }
        return {
          platform: "semantic",
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
  function parseItem(raw) {
    if (!raw?.title) return null;
    try {
      const authors = (raw.authors ?? []).map((a) => {
        const name = a.name ?? "";
        const parts = name.trim().split(/\s+/);
        if (parts.length <= 1) return { lastName: name.trim(), creatorType: "author" };
        const lastName = parts.pop();
        return { firstName: parts.join(" "), lastName, creatorType: "author" };
      });
      const doi = raw.externalIds?.DOI ?? "";
      const citationCount = raw.citationCount ?? 0;
      let date;
      if (raw.publicationDate) {
        date = raw.publicationDate;
      } else if (raw.year) {
        date = String(raw.year);
      }
      const extraParts = [];
      extraParts.push(`S2 ID: ${raw.paperId}`);
      if (raw.isOpenAccess) extraParts.push("Open Access: Yes");
      if (citationCount > 0) extraParts.push(`Citations: ${citationCount}`);
      if (raw.fieldsOfStudy?.length) extraParts.push(`Fields: ${raw.fieldsOfStudy.join(", ")}`);
      if (raw.openAccessPdf?.url) extraParts.push(`PDF: ${raw.openAccessPdf.url}`);
      return {
        itemType: "journalArticle",
        title: raw.title.trim(),
        creators: authors,
        abstractNote: raw.abstract?.trim() || void 0,
        date,
        DOI: doi || void 0,
        url: raw.url || `https://www.semanticscholar.org/paper/${raw.paperId}`,
        publicationTitle: raw.venue || raw.journal?.name || void 0,
        extra: extraParts.join("\n"),
        source: "semantic",
        citationCount
      };
    } catch {
      return null;
    }
  }
  return __toCommonJS(index_exports);
})();
