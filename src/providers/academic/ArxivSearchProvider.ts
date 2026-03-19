import { HttpClient } from "../../infra/HttpClient";
import { XmlParser } from "../../infra/XmlParser";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "http://export.arxiv.org/api";

export class ArxivSearchProvider implements SearchProvider {
  readonly id = "arxiv";
  readonly name = "arXiv";
  readonly sourceType = "academic" as const;

  private http = new HttpClient({ baseURL: BASE_URL, timeout: 30_000 });

  isAvailable(): boolean {
    return configProvider.getBool("platform.arxiv.enabled", true);
  }

  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const maxResults = options?.maxResults ?? 10;
    const page = options?.page ?? 1;
    const start = (page - 1) * maxResults;

    const searchQuery = this.buildQuery(query, options);

    try {
      const sortOrder = options?.extra?.sortOrder
        || configProvider.getString("platform.arxiv.sortOrder", "descending");

      const response = await this.http.get<string>("/query", {
        params: {
          search_query: searchQuery,
          start,
          max_results: maxResults,
          sortBy: this.mapSortBy(options?.sortBy),
          sortOrder,
        },
      });

      const items = this.parseResponse(response.data);

      return {
        platform: this.id,
        query,
        totalResults: items.length,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: items.length === maxResults,
      };
    } catch (error: any) {
      logger.error("arXiv search failed", error?.message);
      throw error;
    }
  }

  private buildQuery(query: string, options?: SearchOptions): string {
    const parts: string[] = [`all:${query}`];
    if (options?.author) {
      parts.push(`au:${options.author}`);
    }
    return parts.join("+AND+");
  }

  private mapSortBy(sortBy?: string): string {
    switch (sortBy) {
      case "date":
        return "submittedDate";
      case "relevance":
      default:
        return "relevance";
    }
  }

  private parseResponse(xml: string): ResourceItem[] {
    const doc = XmlParser.parse(xml);
    const entries = XmlParser.getElements(doc, "entry");
    const items: ResourceItem[] = [];

    for (const entry of entries) {
      const item = this.parseEntry(entry);
      if (item) items.push(item);
    }

    return items;
  }

  private parseEntry(entry: Element): ResourceItem | null {
    try {
      const idUrl = XmlParser.getText(entry, "id") ?? "";
      const arxivId = idUrl.split("/abs/").pop() ?? idUrl;

      const title = (XmlParser.getText(entry, "title") ?? "")
        .replace(/\s+/g, " ")
        .trim();

      if (!title) return null;

      const authorElements = XmlParser.getElements(entry, "author");
      const creators = authorElements.map((authorEl) => {
        const fullName = XmlParser.getText(authorEl, "name") ?? "";
        return this.splitAuthorName(fullName);
      });

      const summary = (XmlParser.getText(entry, "summary") ?? "")
        .replace(/\s+/g, " ")
        .trim();

      const published = XmlParser.getText(entry, "published") ?? "";
      let date: string | undefined;
      if (published) {
        const d = new Date(published);
        if (!isNaN(d.getTime())) {
          date = d.toISOString().split("T")[0];
        }
      }

      const categoryElements = XmlParser.getElements(entry, "category");
      const categories: string[] = [];
      for (const cat of categoryElements) {
        const term = XmlParser.getAttribute(cat, "term");
        if (term) categories.push(term);
      }

      const linkElements = XmlParser.getElements(entry, "link");
      let pdfUrl = "";
      let htmlUrl = "";
      for (const link of linkElements) {
        const linkTitle = XmlParser.getAttribute(link, "title");
        const href = XmlParser.getAttribute(link, "href") ?? "";
        if (linkTitle === "pdf") pdfUrl = href;
        if (XmlParser.getAttribute(link, "rel") === "alternate") htmlUrl = href;
      }

      const doiEl = entry.getElementsByTagNameNS(
        "http://arxiv.org/schemas/atom",
        "doi",
      );
      let doi: string | undefined;
      if (doiEl.length > 0) {
        doi = doiEl[0].textContent ?? undefined;
      }

      const extraParts: string[] = [];
      extraParts.push(`arXiv ID: ${arxivId}`);
      if (categories.length > 0) {
        extraParts.push(`arXiv categories: ${categories.join(", ")}`);
      }
      if (pdfUrl) {
        extraParts.push(`PDF: ${pdfUrl}`);
      }

      return {
        itemType: "preprint",
        title,
        creators,
        abstractNote: summary || undefined,
        date,
        DOI: doi,
        url: htmlUrl || idUrl,
        tags: categories.map((c) => ({ tag: c })),
        extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
        source: "arxiv",
      };
    } catch (error) {
      logger.warn("Failed to parse arXiv entry", error);
      return null;
    }
  }

  private splitAuthorName(fullName: string): {
    firstName?: string;
    lastName: string;
    creatorType: string;
  } {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) {
      return { lastName: fullName.trim(), creatorType: "author" };
    }
    const lastName = parts.pop()!;
    const firstName = parts.join(" ");
    return { firstName, lastName, creatorType: "author" };
  }
}

providerRegistry.registerSearchProvider(new ArxivSearchProvider());
