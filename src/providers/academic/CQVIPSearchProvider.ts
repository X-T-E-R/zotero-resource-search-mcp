import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://qikan.cqvip.com";

interface CQVIPSearchParams {
  ObjectType: number;
  SearchKeyList: Array<{
    FieldIdentifier: string;
    SearchKey: string;
    PreLogicalOperator: string;
    IsExact: string;
  }>;
  SearchExpression: string;
  BeginYear: string;
  EndYear: string;
  JournalRange: string;
  DomainRange: string;
  PageSize: number;
  PageNum: number;
  Sort: number;
  SortField: string | null;
  ClusterFilter: string;
  ClusterLimit: number;
  ClusterUseType: string;
  UrlParam: string;
  SType: string;
  StrIds: string;
  UpdateTimeType: string;
  IsRefOrBy: number;
  IsNoteHistory: number;
  ShowRules: string;
  AdvShowTitle: string;
  ObjectId: string;
  ObjectSearchType: number;
  ChineseEnglishExtend: number;
  SynonymExtend: number;
  ShowTotalCount: number;
  UserID: string;
  AdvTabGuid: string;
}

export class CQVIPSearchProvider implements SearchProvider {
  readonly id = "cqvip";
  readonly name = "CQVIP 维普";
  readonly sourceType = "academic" as const;

  private http = new HttpClient({
    baseURL: BASE_URL,
    timeout: 30_000,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "text/html, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://qikan.cqvip.com/Qikan/Search/Advance",
    },
  });

  private rateLimiter = new RateLimiter(120);

  isAvailable(): boolean {
    return configProvider.getBool("platform.cqvip.enabled", true);
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = Date.now();
    await this.rateLimiter.acquire();

    let beginYear = "";
    let endYear = "";
    if (options?.year) {
      if (options.year.includes("-")) {
        const [start, end] = options.year.split("-");
        beginYear = start;
        endYear = end;
      } else {
        beginYear = options.year;
        endYear = options.year;
      }
    }

    let sortValue = 1;
    if (options?.sortBy === "relevance") sortValue = 0;
    else if (options?.sortBy === "citations") sortValue = 1;
    else if (options?.sortBy === "date") sortValue = 2;

    const searchExpression = this.buildSearchExpression(query);
    const advTabGuid = this.generateGuid();

    const searchParams: CQVIPSearchParams = {
      ObjectType: 1,
      SearchKeyList: [],
      SearchExpression: searchExpression,
      BeginYear: beginYear,
      EndYear: endYear,
      JournalRange: "",
      DomainRange: "",
      PageSize: options?.maxResults ?? 20,
      PageNum: options?.page ?? 1,
      Sort: sortValue,
      SortField: null,
      ClusterFilter: "",
      ClusterLimit: 0,
      ClusterUseType: "Article",
      UrlParam: "",
      SType: "",
      StrIds: "",
      UpdateTimeType: "",
      IsRefOrBy: 0,
      IsNoteHistory: 1,
      ShowRules: `  任意字段=${query}  `,
      AdvShowTitle: searchExpression,
      ObjectId: "",
      ObjectSearchType: 0,
      ChineseEnglishExtend: 0,
      SynonymExtend: 0,
      ShowTotalCount: 0,
      UserID: "0",
      AdvTabGuid: advTabGuid,
    };

    if (!searchExpression) {
      searchParams.SearchKeyList.push({
        FieldIdentifier: "M",
        SearchKey: query,
        PreLogicalOperator: "",
        IsExact: "0",
      });
      searchParams.AdvShowTitle = "题名=" + query;
      searchParams.ShowRules = `  题名=${query}  `;
    }

    try {
      // Pre-flight GET to establish session cookie
      try {
        await this.http.get("/Qikan/Search/Advance");
      } catch {
        // Ignore errors from session init
      }

      const body = `searchParamModel=${encodeURIComponent(JSON.stringify(searchParams))}`;
      logger.debug("CQVIP search body:", body.slice(0, 500));

      const response = await this.http.post<string>(
        "/Search/SearchList",
        body,
        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded; charset=UTF-8",
          },
        },
      );

      const html = typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);

      logger.debug(`CQVIP response length: ${html.length}, first 300: ${html.slice(0, 300)}`);

      const items = this.parseHtmlResponse(html);

      const totalMatch = html.match(
        /id=["']hidShowTotalCount["'][^>]*value=["'](\d+)["']/,
      );
      const total = totalMatch ? parseInt(totalMatch[1], 10) : items.length;

      if (items.length === 0 && html.length > 0) {
        logger.warn(`CQVIP returned HTML (${html.length} chars) but parsed 0 items. ` +
          `Possible selector mismatch. First 500 chars: ${html.slice(0, 500)}`);
      }

      return {
        platform: this.id,
        query,
        totalResults: total,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: items.length === (options?.maxResults ?? 20),
      };
    } catch (error: any) {
      logger.error("CQVIP search failed", error?.message ?? error);
      return {
        platform: this.id,
        query,
        totalResults: 0,
        items: [],
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: false,
        error: `CQVIP search error: ${error?.message ?? error}`,
      };
    }
  }

  private buildSearchExpression(query: string): string {
    const hasFieldIdentifier = /[UMKATRSFJC]=/i.test(query);
    if (hasFieldIdentifier) {
      return this.normalizeOperators(query);
    }
    return this.parseSimpleQuery(query);
  }

  private normalizeOperators(query: string): string {
    return query
      .replace(/\s*&\s*/g, " AND ")
      .replace(/\s*\|\s*/g, " OR ")
      .replace(/\s*!\s*/g, " NOT ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseSimpleQuery(query: string): string {
    let normalized = query
      .replace(/\s*&\s*/g, " AND ")
      .replace(/\s*\|\s*/g, " OR ")
      .replace(/\s*!\s*/g, " NOT ");

    const parts = normalized.split(/\s+(AND|OR|NOT)\s+/i);
    const result: string[] = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (/^(AND|OR|NOT)$/i.test(trimmed)) {
        result.push(trimmed.toUpperCase());
      } else {
        const terms = trimmed.split(/\s+/).filter((t) => t);
        const wrappedTerms = terms.map((term) => {
          if (/^[UMKATRSFJC]=/i.test(term)) return term;
          return `U=${term}`;
        });

        if (wrappedTerms.length > 1) {
          result.push(`(${wrappedTerms.join(" AND ")})`);
        } else if (wrappedTerms.length === 1) {
          result.push(wrappedTerms[0]);
        }
      }
    }

    if (
      result.length === 1 &&
      !result[0].includes(" AND ") &&
      !result[0].includes(" OR ")
    ) {
      const terms = query.trim().split(/\s+/).filter((t) => t);
      if (terms.length > 1) {
        return terms.map((t) => `U=${t}`).join(" AND ");
      }
    }

    return result.join(" ");
  }

  private parseHtmlResponse(html: string): ResourceItem[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const items: ResourceItem[] = [];

    const dlElements = doc.querySelectorAll(".simple-list dl");
    dlElements.forEach((dl: Element) => {
      const item = this.parseDlElement(dl as HTMLElement);
      if (item) items.push(item);
    });

    return items;
  }

  private parseDlElement(dl: HTMLElement): ResourceItem | null {
    try {
      const titleLink = dl.querySelector("dt > a[articleid]");
      if (!titleLink) return null;

      const articleId = titleLink.getAttribute("articleid") ?? "";
      const title = this.cleanText(titleLink.textContent ?? "");
      if (!articleId || !title) return null;

      const creators: ResourceItem["creators"] = [];
      const authorSpans = dl.querySelectorAll(".author span a span");
      authorSpans.forEach((span: Element) => {
        const authorName = span.textContent?.trim();
        if (authorName) {
          creators.push({ lastName: authorName, creatorType: "author" });
        }
      });

      const journalEl = dl.querySelector(".from a");
      const journal = journalEl
        ? journalEl.textContent?.replace(/[《》]/g, "").trim()
        : undefined;

      const volInfo = dl.querySelector(".vol")?.textContent?.trim() ?? "";
      const { year, volume, issue, pages } =
        this.parseVolumeInfo(volInfo);

      let abstractNote: string | undefined;
      const fullAbstractEl = dl.querySelector(
        '.abstract span[style*="display:none"]',
      );
      if (fullAbstractEl) {
        abstractNote = this.cleanText(fullAbstractEl.textContent ?? "");
      } else {
        const firstSpan = dl.querySelector(".abstract span");
        if (firstSpan) {
          abstractNote = this.cleanText(firstSpan.textContent ?? "");
        }
      }

      const tags: Array<{ tag: string }> = [];
      const keywordLinks = dl.querySelectorAll(".subject span a");
      keywordLinks.forEach((a: Element) => {
        const kw = this.cleanText(a.textContent ?? "");
        if (kw) tags.push({ tag: kw });
      });

      const citationEl = dl.querySelector(
        ".cited a[data-zkbycount]",
      );
      const citationCount = citationEl
        ? parseInt(citationEl.getAttribute("data-zkbycount") ?? "0", 10)
        : 0;

      const date = year ? `${year}` : undefined;

      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: abstractNote || undefined,
        date,
        url: `https://qikan.cqvip.com/Qikan/Article/Detail?id=${articleId}`,
        publicationTitle: journal,
        volume,
        issue,
        pages,
        language: "zh-CN",
        tags: tags.length > 0 ? tags : undefined,
        extra: citationCount > 0 ? `Citations: ${citationCount}` : undefined,
        source: "cqvip",
        citationCount,
      };
    } catch (error) {
      logger.warn("Failed to parse CQVIP result element", error);
      return null;
    }
  }

  private parseVolumeInfo(volInfo: string): {
    year?: number;
    volume?: string;
    issue?: string;
    pages?: string;
  } {
    const result: {
      year?: number;
      volume?: string;
      issue?: string;
      pages?: string;
    } = {};

    const yearMatch = volInfo.match(/(\d{4})年/);
    if (yearMatch) result.year = parseInt(yearMatch[1], 10);

    const issueMatch = volInfo.match(/第(\d+)期/);
    if (issueMatch) result.issue = issueMatch[1];

    const pagesMatch = volInfo.match(/期(\d+[-–]\d+)/);
    if (pagesMatch) result.pages = pagesMatch[1];

    return result;
  }

  private cleanText(text: string): string {
    if (!text) return "";
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private generateGuid(): string {
    const hex = "0123456789abcdef";
    let guid = "";
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        guid += "-";
      } else {
        guid += hex[Math.floor(Math.random() * 16)];
      }
    }
    return guid;
  }
}

providerRegistry.registerSearchProvider(new CQVIPSearchProvider());
