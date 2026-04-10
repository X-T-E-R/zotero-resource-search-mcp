import type { ProviderAPI } from "../../_sdk/types";
import type { ResourceItem, SearchOptions, SearchResult } from "../../../models/types";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export function createProvider(api: ProviderAPI) {
  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
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
            hasMore: false,
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
          hasMore: pmids.length === maxResults,
        };
      } catch (e) {
        api.log.error("PubMed search failed", e);
        throw e;
      }
    },
  };
}

async function searchPMIDs(
  api: ProviderAPI,
  query: string,
  options: SearchOptions | undefined,
  maxResults: number,
): Promise<string[]> {
  await api.rateLimit.acquire();

  const searchQuery = buildSearchQuery(query, options);
  const apiKey = api.getGlobalPref("api.pubmed.key");

  const params: Record<string, unknown> = {
    db: "pubmed",
    term: searchQuery,
    retmax: maxResults.toString(),
    retstart: options?.page ? ((options.page - 1) * maxResults).toString() : "0",
    retmode: "xml",
    sort: mapSortField(options?.sortBy),
  };

  if (apiKey) {
    params.api_key = apiKey;
  }

  const response = await api.http.get<string>(`${BASE}/esearch.fcgi`, { params });
  const doc = api.xml.parse(response.data);
  return api.xml.getTextAll(doc, "Id");
}

async function fetchDetails(api: ProviderAPI, pmids: string[]): Promise<ResourceItem[]> {
  await api.rateLimit.acquire();

  const apiKey = api.getGlobalPref("api.pubmed.key");
  const params: Record<string, unknown> = {
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
  };
  if (apiKey) {
    params.api_key = apiKey;
  }

  const response = await api.http.get<string>(`${BASE}/efetch.fcgi`, { params });
  const doc = api.xml.parse(response.data);

  const articles = api.xml.getElements(doc, "PubmedArticle");
  const items: ResourceItem[] = [];

  for (const article of articles) {
    const item = parseArticle(api, article);
    if (item) items.push(item);
  }

  return items;
}

function parseArticle(api: ProviderAPI, article: Element): ResourceItem | null {
  try {
    const medlineCitation = api.xml.getElements(article, "MedlineCitation")[0];
    if (!medlineCitation) return null;

    const articleEl = api.xml.getElements(medlineCitation, "Article")[0];
    if (!articleEl) return null;

    const pmid = api.xml.getText(medlineCitation, "PMID") ?? "";
    const title = (api.xml.getText(articleEl, "ArticleTitle") ?? "").replace(/\.$/, "");

    const abstractTexts = api.xml.getTextAll(articleEl, "AbstractText");
    const abstractNote = abstractTexts.join(" ").trim() || undefined;

    const authorList = api.xml.getElements(articleEl, "Author");
    const creators: ResourceItem["creators"] = [];
    for (const authorEl of authorList) {
      const lastName = api.xml.getText(authorEl, "LastName");
      const foreName = api.xml.getText(authorEl, "ForeName");
      const collectiveName = api.xml.getText(authorEl, "CollectiveName");
      if (lastName) {
        creators.push({
          firstName: foreName ?? undefined,
          lastName,
          creatorType: "author",
        });
      } else if (collectiveName) {
        creators.push({
          lastName: collectiveName,
          creatorType: "author",
        });
      }
    }

    const journal =
      api.xml.getText(articleEl, "Title") ??
      api.xml.getText(articleEl, "ISOAbbreviation") ??
      undefined;

    const journalIssue = api.xml.getElements(articleEl, "JournalIssue")[0];
    const volume = journalIssue
      ? (api.xml.getText(journalIssue, "Volume") ?? undefined)
      : undefined;
    const issue = journalIssue ? (api.xml.getText(journalIssue, "Issue") ?? undefined) : undefined;

    const pubDate = journalIssue ? api.xml.getElements(journalIssue, "PubDate")[0] : null;
    const year = pubDate ? api.xml.getText(pubDate, "Year") : null;
    const month = pubDate ? api.xml.getText(pubDate, "Month") : null;
    const day = pubDate ? api.xml.getText(pubDate, "Day") : null;

    let date: string | undefined;
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

    const pages = api.xml.getText(articleEl, "MedlinePgn") ?? undefined;

    const articleIdList = api.xml.getElements(article, "ArticleId");
    let doi: string | undefined;
    let pmc: string | undefined;
    for (const idEl of articleIdList) {
      const idType = api.xml.getAttribute(idEl, "IdType");
      const idValue = idEl.textContent ?? "";
      if (idType === "doi") doi = idValue;
      if (idType === "pmc") pmc = idValue;
    }

    const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

    const extraParts: string[] = [];
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
      source: "pubmed",
    };
  } catch (error) {
    api.log.warn("Failed to parse PubMed article", error);
    return null;
  }
}

function buildSearchQuery(query: string, options?: SearchOptions): string {
  let searchQuery = query;
  if (options?.author) {
    searchQuery += ` AND ${options.author}[Author]`;
  }
  if (options?.year) {
    searchQuery += ` AND ${options.year}[Publication Date]`;
  }
  return searchQuery;
}

function mapSortField(sortBy?: string): string {
  switch (sortBy) {
    case "date":
      return "pub+date";
    default:
      return "relevance";
  }
}

function parseMonth(month: string): number {
  const monthMap: Record<string, number> = {
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
    Dec: 12,
  };
  const num = parseInt(month, 10);
  if (!isNaN(num)) return num;
  return monthMap[month] ?? 1;
}
