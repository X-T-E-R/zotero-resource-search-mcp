import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { RateLimiter } from "../../infra/RateLimiter";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://zju.summon.serialssolutions.com";

export class ZJUSummonSearchProvider implements SearchProvider {
  readonly id = "zjusummon";
  readonly name = "ZJU Summon";
  readonly sourceType = "academic" as const;

  private http = new HttpClient({
    baseURL: BASE_URL,
    timeout: 30_000,
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "sec-ch-ua":
        '"Microsoft Edge";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "summon-sid": "eff5e93187d374d3acb7ef518b4d2924",
      "x-provider": "saml",
      Referer: "https://zju.summon.serialssolutions.com/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });

  private rateLimiter = new RateLimiter(120);

  isAvailable(): boolean {
    return configProvider.getBool("platform.zjusummon.enabled", true);
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = Date.now();
    await this.rateLimiter.acquire();

    const maxResults = options?.maxResults ?? 10;

    let finalQuery = query;
    if (options?.author) {
      finalQuery += ` AND Author:(${options.author})`;
    }

    const params: Record<string, any> = {
      screen_res: "W1920H1080",
      __refererURL: "https://zju.summon.serialssolutions.com/",
      pn: (options?.page ?? 1).toString(),
      ho: "t",
      "include.ft.matches": "f",
      l: "zh-CN",
      q: finalQuery,
      "fvf[]": "ContentType,Journal Article,f",
      page_size: maxResults,
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

    try {
      const response = await this.http.get<any>("/api/search", { params });
      const data = response.data;
      const documents: any[] = data.documents ?? [];

      const items: ResourceItem[] = [];
      for (const doc of documents) {
        const item = this.parseDocument(doc);
        if (item) items.push(item);
      }

      return {
        platform: this.id,
        query,
        totalResults: data.recordCount ?? items.length,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: items.length === maxResults,
      };
    } catch (error: any) {
      logger.error("ZJU Summon search failed", error?.message);
      throw error;
    }
  }

  private parseDocument(doc: any): ResourceItem | null {
    try {
      const dois: string[] = doc.dois ?? [];
      const doi = dois[0] ?? doc.doi ?? "";

      const uris: string[] = doc.uris ?? [];
      const url = uris[0] ?? doc.link ?? "";

      const abstractsList: any[] = doc.abstracts ?? [];
      const abstractNote = abstractsList
        .map((a: any) => a.abstract ?? "")
        .filter((t: string) => t)
        .join("\n\n");

      const yearList: string[] = doc.publication_years ?? [];
      const year =
        yearList[0] ??
        (doc.publication_date ?? "").substring(0, 4);

      const volumes: string[] = doc.volumes ?? [];
      const issues: string[] = doc.issues ?? [];

      const rawTitle: string = doc.title ?? "No Title";
      const title = this.cleanText(rawTitle);

      const authors: any[] = doc.authors ?? [];
      const creators: ResourceItem["creators"] = authors.map(
        (a: any) => {
          const fullName: string = a.fullname ?? "";
          return this.splitAuthorName(fullName);
        },
      );

      let date: string | undefined;
      if (doc.publication_date) {
        const parsed = new Date(doc.publication_date);
        if (!isNaN(parsed.getTime())) {
          date = parsed.toISOString().split("T")[0];
        }
      } else if (year) {
        date = year;
      }

      const extraParts: string[] = [];
      if (doc.publisher) extraParts.push(`Publisher: ${doc.publisher}`);

      return {
        itemType: "journalArticle",
        title,
        creators,
        abstractNote: this.cleanText(abstractNote) || undefined,
        date,
        DOI: doi || undefined,
        url: url || undefined,
        publicationTitle: doc.publication_title ?? undefined,
        volume: volumes[0] ?? undefined,
        issue: issues[0] ?? undefined,
        pages: doc.pages ?? undefined,
        extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
        source: "zjusummon",
      };
    } catch (error) {
      logger.warn("Failed to parse ZJU Summon document", error);
      return null;
    }
  }

  private cleanText(text: string): string {
    if (!text) return "";
    return text
      .replace(/<mark class="chinaHighlighting">/g, "")
      .replace(/<\/mark>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private splitAuthorName(fullName: string): {
    firstName?: string;
    lastName: string;
    creatorType: string;
  } {
    const trimmed = fullName.trim();
    if (!trimmed) return { lastName: "Unknown", creatorType: "author" };

    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) {
      return { lastName: trimmed, creatorType: "author" };
    }
    const lastName = parts.pop()!;
    const firstName = parts.join(" ");
    return { firstName, lastName, creatorType: "author" };
  }
}

providerRegistry.registerSearchProvider(new ZJUSummonSearchProvider());
