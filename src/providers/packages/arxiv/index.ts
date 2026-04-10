import type { ProviderAPI } from "../../_sdk/types";
import type { ResourceItem, SearchOptions, SearchResult } from "../../../models/types";

const BASE = "https://export.arxiv.org/api";

export function createProvider(api: ProviderAPI) {
  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      const startTime = Date.now();
      const maxResults = options?.maxResults ?? 10;
      const page = options?.page ?? 1;
      const start = (page - 1) * maxResults;

      const searchQuery = buildQuery(query, options);

      const sortOrder =
        (options?.extra?.sortOrder as string) || api.config.getString("sortOrder", "descending");

      const response = await api.http.get<string>(`${BASE}/query`, {
        params: {
          search_query: searchQuery,
          start,
          max_results: maxResults,
          sortBy: mapSortBy(options?.sortBy),
          sortOrder,
        },
      });

      const items = parseResponse(api, response.data);

      return {
        platform: "arxiv",
        query,
        totalResults: items.length,
        items,
        page: options?.page ?? 1,
        elapsed: Date.now() - startTime,
        hasMore: items.length === maxResults,
      };
    },
  };
}

function buildQuery(query: string, options?: SearchOptions): string {
  const parts: string[] = [`all:${query}`];
  if (options?.author) {
    parts.push(`au:${options.author}`);
  }
  return parts.join("+AND+");
}

function mapSortBy(sortBy?: string): string {
  switch (sortBy) {
    case "date":
      return "submittedDate";
    case "relevance":
    default:
      return "relevance";
  }
}

function parseResponse(api: ProviderAPI, xml: string): ResourceItem[] {
  const doc = api.xml.parse(xml);
  const entries = api.xml.getElements(doc, "entry");
  const items: ResourceItem[] = [];

  for (const entry of entries) {
    const item = parseEntry(api, entry);
    if (item) items.push(item);
  }

  return items;
}

function parseEntry(api: ProviderAPI, entry: Element): ResourceItem | null {
  try {
    const idUrl = api.xml.getText(entry, "id") ?? "";
    const arxivId = idUrl.split("/abs/").pop() ?? idUrl;

    const title = (api.xml.getText(entry, "title") ?? "").replace(/\s+/g, " ").trim();

    if (!title) return null;

    const authorElements = api.xml.getElements(entry, "author");
    const creators = authorElements.map((authorEl) => {
      const fullName = api.xml.getText(authorEl, "name") ?? "";
      return splitAuthorName(fullName);
    });

    const summary = (api.xml.getText(entry, "summary") ?? "").replace(/\s+/g, " ").trim();

    const published = api.xml.getText(entry, "published") ?? "";
    let date: string | undefined;
    if (published) {
      const d = new Date(published);
      if (!isNaN(d.getTime())) {
        date = d.toISOString().split("T")[0];
      }
    }

    const categoryElements = api.xml.getElements(entry, "category");
    const categories: string[] = [];
    for (const cat of categoryElements) {
      const term = api.xml.getAttribute(cat, "term");
      if (term) categories.push(term);
    }

    const linkElements = api.xml.getElements(entry, "link");
    let pdfUrl = "";
    let htmlUrl = "";
    for (const link of linkElements) {
      const linkTitle = api.xml.getAttribute(link, "title");
      const href = api.xml.getAttribute(link, "href") ?? "";
      if (linkTitle === "pdf") pdfUrl = href;
      if (api.xml.getAttribute(link, "rel") === "alternate") htmlUrl = href;
    }

    const doiEl = entry.getElementsByTagNameNS("http://arxiv.org/schemas/atom", "doi");
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
  } catch (e) {
    api.log.warn("Failed to parse arXiv entry", e);
    return null;
  }
}

function splitAuthorName(fullName: string): {
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
