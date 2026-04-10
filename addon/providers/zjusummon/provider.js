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

  // src/providers/packages/zjusummon/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });
  var BASE = "https://zju.summon.serialssolutions.com";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        await api.rateLimit.acquire();
        const maxResults = options?.maxResults ?? 10;
        let finalQuery = query;
        if (options?.author) {
          finalQuery += ` AND Author:(${options.author})`;
        }
        const params = {
          screen_res: "W1920H1080",
          __refererURL: "https://zju.summon.serialssolutions.com/",
          pn: (options?.page ?? 1).toString(),
          ho: "t",
          "include.ft.matches": "f",
          l: "zh-CN",
          q: finalQuery,
          "fvf[]": "ContentType,Journal Article,f",
          page_size: maxResults
        };
        if (options?.year) {
          if (options.year.includes("-")) {
            const [start, end] = options.year.split("-");
            params["rf[]"] = `PublicationDate,${start}-01-01:${end}-12-31`;
          } else {
            params["rf[]"] = `PublicationDate,${options.year}-01-01:${options.year}-12-31`;
          }
        }
        if (options?.sortBy === "date") {
          params.sort = "PublicationDate:desc";
        }
        const headers = {
          accept: "application/json, text/plain, */*",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "sec-ch-ua": '"Microsoft Edge";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "summon-sid": "eff5e93187d374d3acb7ef518b4d2924",
          "x-provider": "saml",
          Referer: "https://zju.summon.serialssolutions.com/",
          "Referrer-Policy": "strict-origin-when-cross-origin"
        };
        const response = await api.http.get(`${BASE}/api/search`, { params, headers });
        const data = response.data;
        const documents = data.documents ?? [];
        const items = [];
        for (const doc of documents) {
          const item = parseDocument(doc);
          if (item) items.push(item);
        }
        return {
          platform: "zjusummon",
          query,
          totalResults: data.recordCount ?? items.length,
          items,
          page: options?.page ?? 1,
          elapsed: Date.now() - startTime,
          hasMore: items.length === maxResults
        };
      }
    };
  }
  function parseDocument(doc) {
    try {
      const dois = doc.dois ?? [];
      const doi = dois[0] ?? doc.doi ?? "";
      const uris = doc.uris ?? [];
      const url = uris[0] ?? doc.link ?? "";
      const abstractsList = doc.abstracts ?? [];
      const abstractNote = abstractsList.map((a) => a.abstract ?? "").filter((t) => t).join("\n\n");
      const yearList = doc.publication_years ?? [];
      const year = yearList[0] ?? (doc.publication_date ?? "").substring(0, 4);
      const volumes = doc.volumes ?? [];
      const issues = doc.issues ?? [];
      const rawTitle = doc.title ?? "No Title";
      const title = cleanText(rawTitle);
      const authors = doc.authors ?? [];
      const creators = authors.map((a) => {
        const fullName = a.fullname ?? "";
        return splitAuthorName(fullName);
      });
      let date;
      if (doc.publication_date) {
        const parsed = new Date(doc.publication_date);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString().split("T")[0];
        }
      } else if (year) {
        date = year;
      }
      const extraParts = [];
      if (doc.publisher) extraParts.push(`Publisher: ${doc.publisher}`);
      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: cleanText(abstractNote) || void 0,
        date,
        DOI: doi || void 0,
        url: url || void 0,
        publicationTitle: doc.publication_title ?? void 0,
        volume: volumes[0] ?? void 0,
        issue: issues[0] ?? void 0,
        pages: doc.pages ?? void 0,
        extra: extraParts.length > 0 ? extraParts.join("\n") : void 0,
        source: "zjusummon"
      };
    } catch (error) {
      return null;
    }
  }
  function cleanText(text) {
    if (!text) return "";
    return text.replace(/<mark class="chinaHighlighting">/g, "").replace(/<\/mark>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }
  function splitAuthorName(fullName) {
    const trimmed = fullName.trim();
    if (!trimmed) return { lastName: "Unknown", creatorType: "author" };
    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) {
      return { lastName: trimmed, creatorType: "author" };
    }
    const lastName = parts.pop();
    const firstName = parts.join(" ");
    return { firstName, lastName, creatorType: "author" };
  }
  return __toCommonJS(index_exports);
})();
