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

  // src/providers/packages/crossref/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });

  // src/providers/shared/crossrefParse.ts
  var CROSSREF_TYPE_MAP = {
    "journal-article": "journalArticle",
    "proceedings-article": "conferencePaper",
    "book-chapter": "bookSection",
    book: "book",
    "posted-content": "preprint",
    "report-component": "report",
    report: "report",
    dissertation: "thesis",
    dataset: "document",
    monograph: "book"
  };
  function parseCrossrefItem(data) {
    try {
      const doi = data.DOI ?? "";
      const titleList = data.title ?? [];
      const title = titleList[0] ?? "No title";
      const creators = [];
      for (const author of data.author ?? []) {
        const family = author.family ?? "";
        const given = author.given ?? "";
        if (family || given) {
          creators.push({
            firstName: given || void 0,
            lastName: family || given,
            creatorType: "author"
          });
        }
      }
      let abstractNote = data.abstract ?? "";
      if (abstractNote) {
        abstractNote = abstractNote.replace(/<[^>]+>/g, "");
      }
      let date;
      const dateData = data["published-print"] ?? data["published-online"] ?? data["published"] ?? data["created"];
      if (dateData?.["date-parts"]?.[0]) {
        const parts = dateData["date-parts"][0];
        if (parts[0]) {
          const y = parts[0];
          const m = String(parts[1] ?? 1).padStart(2, "0");
          const d = String(parts[2] ?? 1).padStart(2, "0");
          date = `${y}-${m}-${d}`;
        }
      }
      const itemType = CROSSREF_TYPE_MAP[data.type ?? ""] ?? "journalArticle";
      const citationCount = data["is-referenced-by-count"] ?? 0;
      const issn = data.ISSN ?? [];
      const extraParts = [];
      if (data.publisher) {
        extraParts.push(`Publisher: ${data.publisher}`);
      }
      if (citationCount > 0) {
        extraParts.push(`Citations: ${citationCount}`);
      }
      if (data.subject?.length) {
        extraParts.push(`Subjects: ${data.subject.join("; ")}`);
      }
      return {
        itemType,
        title,
        creators,
        abstractNote: abstractNote || void 0,
        date,
        DOI: doi || void 0,
        url: data.URL ?? (doi ? `https://doi.org/${doi}` : void 0),
        publicationTitle: data["container-title"]?.[0] ?? void 0,
        volume: data.volume ?? void 0,
        issue: data.issue ?? void 0,
        pages: data.page ?? void 0,
        ISSN: issn[0] ?? void 0,
        extra: extraParts.length > 0 ? extraParts.join("\n") : void 0,
        source: "crossref",
        citationCount
      };
    } catch {
      return null;
    }
  }

  // src/providers/packages/crossref/index.ts
  var WORKS = "https://api.crossref.org/works";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        const maxResults = Math.min(options?.maxResults ?? 10, 1e3);
        const mailto = api.getGlobalPref("api.crossref.mailto", "paper-search-mcp@example.com");
        const params = {
          query,
          rows: maxResults,
          offset: options?.page ? (options.page - 1) * maxResults : 0,
          mailto
        };
        const filters = [];
        if (options?.year) {
          const yearMatch = options.year.match(/^(\d{4})(?:-(\d{4})?)?$/);
          if (yearMatch) {
            filters.push(`from-pub-date:${yearMatch[1]}`);
            if (yearMatch[2]) {
              filters.push(`until-pub-date:${yearMatch[2]}`);
            }
          }
        }
        if (filters.length > 0) {
          params.filter = filters.join(",");
        }
        const sortMapping = {
          relevance: "relevance",
          date: "published",
          citations: "is-referenced-by-count"
        };
        params.sort = sortMapping[options?.sortBy ?? "relevance"] ?? "relevance";
        params.order = "desc";
        const response = await api.http.get(WORKS, { params });
        const message = response.data?.message;
        const crossrefItems = message?.items ?? [];
        const total = message?.["total-results"] ?? crossrefItems.length;
        const items = [];
        for (const raw of crossrefItems) {
          const item = parseCrossrefItem(raw);
          if (item) items.push(item);
        }
        return {
          platform: "crossref",
          query,
          totalResults: total,
          items,
          page: options?.page ?? 1,
          elapsed: Date.now() - startTime,
          hasMore: total > (options?.page ?? 1) * maxResults
        };
      }
    };
  }
  return __toCommonJS(index_exports);
})();
