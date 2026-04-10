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

  // src/providers/packages/biorxiv/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });
  var BASE = "https://api.biorxiv.org/details/biorxiv";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        const maxResults = options?.maxResults ?? 10;
        const page = options?.page ?? 1;
        const days = options?.extra?.days ?? 30;
        const end = /* @__PURE__ */ new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1e3);
        const startDate = start.toISOString().split("T")[0];
        const endDate = end.toISOString().split("T")[0];
        const cursor = (page - 1) * maxResults;
        try {
          const response = await api.http.get(`${BASE}/${startDate}/${endDate}/${cursor}`);
          const collection = response.data?.collection ?? [];
          let items = [];
          for (const raw of collection) {
            const item = parseItem(raw);
            if (item) items.push(item);
          }
          if (query && query !== "*" && query.trim()) {
            const qLower = query.toLowerCase();
            items = items.filter(
              (it) => it.title.toLowerCase().includes(qLower) || (it.abstractNote ?? "").toLowerCase().includes(qLower) || it.creators?.some(
                (c) => `${c.firstName ?? ""} ${c.lastName}`.toLowerCase().includes(qLower)
              )
            );
          }
          if (options?.extra?.category) {
            const cat = String(options.extra.category).toLowerCase();
            items = items.filter((it) => it.tags?.some((t) => t.tag.toLowerCase().includes(cat)));
          }
          const totalFiltered = items.length;
          items = items.slice(0, maxResults);
          return {
            platform: "biorxiv",
            query,
            totalResults: totalFiltered,
            items,
            page,
            elapsed: Date.now() - startTime,
            hasMore: totalFiltered > maxResults
          };
        } catch (error) {
          api.log.error("bioRxiv search failed", error?.message);
          throw error;
        }
      }
    };
  }
  function parseItem(raw) {
    if (!raw?.title) return null;
    try {
      const doi = raw.doi ?? "";
      const authorStr = raw.authors ?? "";
      const creators = authorStr.split(";").map((a) => a.trim()).filter(Boolean).map((name) => {
        const parts = name.split(",").map((s) => s.trim());
        if (parts.length >= 2) {
          return {
            lastName: parts[0],
            firstName: parts.slice(1).join(" "),
            creatorType: "author"
          };
        }
        return { lastName: name, creatorType: "author" };
      });
      const version = raw.version ?? "1";
      const url = `https://www.biorxiv.org/content/${doi}v${version}`;
      const pdfUrl = `${url}.full.pdf`;
      const date = raw.date ?? void 0;
      const extraParts = [];
      if (raw.category) extraParts.push(`Category: ${raw.category}`);
      extraParts.push(`Version: ${version}`);
      extraParts.push(`PDF: ${pdfUrl}`);
      return {
        itemType: "preprint",
        title: raw.title,
        creators,
        abstractNote: raw.abstract || void 0,
        date,
        DOI: doi || void 0,
        url,
        tags: raw.category ? [{ tag: raw.category }] : void 0,
        extra: extraParts.join("\n"),
        source: "biorxiv"
      };
    } catch {
      return null;
    }
  }
  return __toCommonJS(index_exports);
})();
