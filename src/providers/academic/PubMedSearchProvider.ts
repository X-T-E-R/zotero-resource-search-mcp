import { HttpClient } from "../../infra/HttpClient";
import { XmlParser } from "../../infra/XmlParser";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export class PubMedSearchProvider implements SearchProvider {
  readonly id = "pubmed";
  readonly name = "PubMed";
  readonly sourceType = "academic" as const;

  private http = new HttpClient({ baseURL: BASE_URL, timeout: 30_000 });
  private rateLimiter = new RateLimiter(180);

  isAvailable(): boolean {
    return configProvider.getBool("platform.pubmed.enabled", true);
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const maxResults = options?.maxResults ?? 10;

    try {
      const pmids = await this.searchPMIDs(query, options, maxResults);

      if (pmids.length === 0) {
        return {
          platform: this.id,
          query,
          totalResults: 0,
          items: [],
          page: options?.page ?? 1,
          elapsed: Date.now() - startTime,
          hasMore: false,
        };
      }

      const items = await this.fetchDetails(pmids);

      return {
        platform: this.id,
        query,
        totalResults: items.length,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: pmids.length === maxResults,
      };
    } catch (error: any) {
      logger.error("PubMed search failed", error?.message);
      throw error;
    }
  }

  private async searchPMIDs(
    query: string,
    options: SearchOptions | undefined,
    maxResults: number,
  ): Promise<string[]> {
    await this.rateLimiter.acquire();

    const searchQuery = this.buildSearchQuery(query, options);
    const apiKey = configProvider.getString("api.pubmed.key");

    const params: Record<string, any> = {
      db: "pubmed",
      term: searchQuery,
      retmax: maxResults.toString(),
      retstart: options?.page
        ? ((options.page - 1) * maxResults).toString()
        : "0",
      retmode: "xml",
      sort: this.mapSortField(options?.sortBy),
    };

    if (apiKey) {
      params.api_key = apiKey;
    }

    const response = await this.http.get<string>("/esearch.fcgi", { params });
    const doc = XmlParser.parse(response.data);
    return XmlParser.getTextAll(doc, "Id");
  }

  private async fetchDetails(pmids: string[]): Promise<ResourceItem[]> {
    await this.rateLimiter.acquire();

    const apiKey = configProvider.getString("api.pubmed.key");
    const params: Record<string, any> = {
      db: "pubmed",
      id: pmids.join(","),
      retmode: "xml",
    };
    if (apiKey) {
      params.api_key = apiKey;
    }

    const response = await this.http.get<string>("/efetch.fcgi", { params });
    const doc = XmlParser.parse(response.data);

    const articles = XmlParser.getElements(doc, "PubmedArticle");
    const items: ResourceItem[] = [];

    for (const article of articles) {
      const item = this.parseArticle(article);
      if (item) items.push(item);
    }

    return items;
  }

  private parseArticle(article: Element): ResourceItem | null {
    try {
      const medlineCitation = XmlParser.getElements(article, "MedlineCitation")[0];
      if (!medlineCitation) return null;

      const articleEl = XmlParser.getElements(medlineCitation, "Article")[0];
      if (!articleEl) return null;

      const pmid = XmlParser.getText(medlineCitation, "PMID") ?? "";
      const title = (XmlParser.getText(articleEl, "ArticleTitle") ?? "")
        .replace(/\.$/, "");

      const abstractTexts = XmlParser.getTextAll(articleEl, "AbstractText");
      const abstractNote = abstractTexts.join(" ").trim() || undefined;

      const authorList = XmlParser.getElements(articleEl, "Author");
      const creators: ResourceItem["creators"] = [];
      for (const authorEl of authorList) {
        const lastName = XmlParser.getText(authorEl, "LastName");
        const foreName = XmlParser.getText(authorEl, "ForeName");
        const collectiveName = XmlParser.getText(authorEl, "CollectiveName");
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
        XmlParser.getText(articleEl, "Title") ??
        XmlParser.getText(articleEl, "ISOAbbreviation") ??
        undefined;

      const journalIssue = XmlParser.getElements(articleEl, "JournalIssue")[0];
      const volume = journalIssue
        ? XmlParser.getText(journalIssue, "Volume") ?? undefined
        : undefined;
      const issue = journalIssue
        ? XmlParser.getText(journalIssue, "Issue") ?? undefined
        : undefined;

      const pubDate = journalIssue
        ? XmlParser.getElements(journalIssue, "PubDate")[0]
        : null;
      const year = pubDate ? XmlParser.getText(pubDate, "Year") : null;
      const month = pubDate ? XmlParser.getText(pubDate, "Month") : null;
      const day = pubDate ? XmlParser.getText(pubDate, "Day") : null;

      let date: string | undefined;
      if (year) {
        date = year;
        if (month) {
          const monthNum = this.parseMonth(month);
          date += `-${String(monthNum).padStart(2, "0")}`;
          if (day) {
            date += `-${String(day).padStart(2, "0")}`;
          }
        }
      }

      const pages =
        XmlParser.getText(articleEl, "MedlinePgn") ?? undefined;

      const articleIdList = XmlParser.getElements(article, "ArticleId");
      let doi: string | undefined;
      let pmc: string | undefined;
      for (const idEl of articleIdList) {
        const idType = XmlParser.getAttribute(idEl, "IdType");
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
      logger.warn("Failed to parse PubMed article", error);
      return null;
    }
  }

  private buildSearchQuery(
    query: string,
    options?: SearchOptions,
  ): string {
    let searchQuery = query;
    if (options?.author) {
      searchQuery += ` AND ${options.author}[Author]`;
    }
    if (options?.year) {
      searchQuery += ` AND ${options.year}[Publication Date]`;
    }
    return searchQuery;
  }

  private mapSortField(sortBy?: string): string {
    switch (sortBy) {
      case "date":
        return "pub+date";
      default:
        return "relevance";
    }
  }

  private parseMonth(month: string): number {
    const monthMap: Record<string, number> = {
      Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
      Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
    };
    const num = parseInt(month, 10);
    if (!isNaN(num)) return num;
    return monthMap[month] ?? 1;
  }
}

providerRegistry.registerSearchProvider(new PubMedSearchProvider());
