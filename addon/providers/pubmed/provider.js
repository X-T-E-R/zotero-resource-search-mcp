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

  // src/providers/packages/pubmed/index.ts
  var index_exports = {};
  __export(index_exports, {
    createProvider: () => createProvider
  });
  var BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  function createProvider(api) {
    return {
      async search(query, options) {
        const startTime = Date.now();
        const maxResults = options?.maxResults ?? 10;
        try {
          const pmids = await searchPMIDs(api, query, options, maxResults);
          if (pmids.length === 0) {
            return {
              platform: "pubmed",
              query,
              totalResults: 0,
              items: [],
              page: options?.page ?? 1,
              elapsed: Date.now() - startTime,
              hasMore: false
            };
          }
          const items = await fetchDetails(api, pmids);
          return {
            platform: "pubmed",
            query,
            totalResults: items.length,
            items,
            page: options?.page ?? 1,
            elapsed: Date.now() - startTime,
            hasMore: pmids.length === maxResults
          };
        } catch (e) {
          api.log.error("PubMed search failed", e);
          throw e;
        }
      }
    };
  }
  async function searchPMIDs(api, query, options, maxResults) {
    await api.rateLimit.acquire();
    const searchQuery = buildSearchQuery(query, options);
    const apiKey = api.getGlobalPref("api.pubmed.key");
    const params = {
      db: "pubmed",
      term: searchQuery,
      retmax: maxResults.toString(),
      retstart: options?.page ? ((options.page - 1) * maxResults).toString() : "0",
      retmode: "xml",
      sort: mapSortField(options?.sortBy)
    };
    if (apiKey) {
      params.api_key = apiKey;
    }
    const response = await api.http.get(`${BASE}/esearch.fcgi`, { params });
    const doc = api.xml.parse(response.data);
    return api.xml.getTextAll(doc, "Id");
  }
  async function fetchDetails(api, pmids) {
    await api.rateLimit.acquire();
    const apiKey = api.getGlobalPref("api.pubmed.key");
    const params = {
      db: "pubmed",
      id: pmids.join(","),
      retmode: "xml"
    };
    if (apiKey) {
      params.api_key = apiKey;
    }
    const response = await api.http.get(`${BASE}/efetch.fcgi`, { params });
    const doc = api.xml.parse(response.data);
    const articles = api.xml.getElements(doc, "PubmedArticle");
    const items = [];
    for (const article of articles) {
      const item = parseArticle(api, article);
      if (item) items.push(item);
    }
    return items;
  }
  function parseArticle(api, article) {
    try {
      const medlineCitation = api.xml.getElements(article, "MedlineCitation")[0];
      if (!medlineCitation) return null;
      const articleEl = api.xml.getElements(medlineCitation, "Article")[0];
      if (!articleEl) return null;
      const pmid = api.xml.getText(medlineCitation, "PMID") ?? "";
      const title = (api.xml.getText(articleEl, "ArticleTitle") ?? "").replace(/\.$/, "");
      const abstractTexts = api.xml.getTextAll(articleEl, "AbstractText");
      const abstractNote = abstractTexts.join(" ").trim() || void 0;
      const authorList = api.xml.getElements(articleEl, "Author");
      const creators = [];
      for (const authorEl of authorList) {
        const lastName = api.xml.getText(authorEl, "LastName");
        const foreName = api.xml.getText(authorEl, "ForeName");
        const collectiveName = api.xml.getText(authorEl, "CollectiveName");
        if (lastName) {
          creators.push({
            firstName: foreName ?? void 0,
            lastName,
            creatorType: "author"
          });
        } else if (collectiveName) {
          creators.push({
            lastName: collectiveName,
            creatorType: "author"
          });
        }
      }
      const journal = api.xml.getText(articleEl, "Title") ?? api.xml.getText(articleEl, "ISOAbbreviation") ?? void 0;
      const journalIssue = api.xml.getElements(articleEl, "JournalIssue")[0];
      const volume = journalIssue ? api.xml.getText(journalIssue, "Volume") ?? void 0 : void 0;
      const issue = journalIssue ? api.xml.getText(journalIssue, "Issue") ?? void 0 : void 0;
      const pubDate = journalIssue ? api.xml.getElements(journalIssue, "PubDate")[0] : null;
      const year = pubDate ? api.xml.getText(pubDate, "Year") : null;
      const month = pubDate ? api.xml.getText(pubDate, "Month") : null;
      const day = pubDate ? api.xml.getText(pubDate, "Day") : null;
      let date;
      if (year) {
        date = year;
        if (month) {
          const monthNum = parseMonth(month);
          date += `-${String(monthNum).padStart(2, "0")}`;
          if (day) {
            date += `-${String(day).padStart(2, "0")}`;
          }
        }
      }
      const pages = api.xml.getText(articleEl, "MedlinePgn") ?? void 0;
      const articleIdList = api.xml.getElements(article, "ArticleId");
      let doi;
      let pmc;
      for (const idEl of articleIdList) {
        const idType = api.xml.getAttribute(idEl, "IdType");
        const idValue = idEl.textContent ?? "";
        if (idType === "doi") doi = idValue;
        if (idType === "pmc") pmc = idValue;
      }
      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
      const extraParts = [];
      extraParts.push(`PMID: ${pmid}`);
      if (pmc) extraParts.push(`PMCID: ${pmc}`);
      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote,
        date,
        DOI: doi,
        url,
        publicationTitle: journal,
        volume,
        issue,
        pages,
        extra: extraParts.join("\n"),
        source: "pubmed"
      };
    } catch (error) {
      api.log.warn("Failed to parse PubMed article", error);
      return null;
    }
  }
  function buildSearchQuery(query, options) {
    let searchQuery = query;
    if (options?.author) {
      searchQuery += ` AND ${options.author}[Author]`;
    }
    if (options?.year) {
      searchQuery += ` AND ${options.year}[Publication Date]`;
    }
    return searchQuery;
  }
  function mapSortField(sortBy) {
    switch (sortBy) {
      case "date":
        return "pub+date";
      default:
        return "relevance";
    }
  }
  function parseMonth(month) {
    const monthMap = {
      Jan: 1,
      Feb: 2,
      Mar: 3,
      Apr: 4,
      May: 5,
      Jun: 6,
      Jul: 7,
      Aug: 8,
      Sep: 9,
      Oct: 10,
      Nov: 11,
      Dec: 12
    };
    const num = parseInt(month, 10);
    if (!isNaN(num)) return num;
    return monthMap[month] ?? 1;
  }
  return __toCommonJS(index_exports);
})();
