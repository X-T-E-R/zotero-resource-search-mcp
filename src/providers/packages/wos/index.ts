import type { ProviderAPI } from "../../_sdk/types";
import type { ResourceItem, SearchOptions, SearchResult } from "../../../models/types";

const BASE = "https://api.clarivate.com/apis/wos-starter/v2";

export function createProvider(api: ProviderAPI) {
  return {
    async search(query: string, options?: SearchOptions): Promise<SearchResult> {
      const startTime = Date.now();
      const key = api.getGlobalPref("api.wos.key");
      if (!key) {
        throw new Error("Web of Science API key required (api.wos.key)");
      }

      const maxResults = Math.min(options?.maxResults ?? 25, 50);
      const page = options?.page ?? 1;

      await api.rateLimit.acquire();

      const q = buildQuery(query, options);
      const sortField = mapSortField(options?.sortBy ?? "citations");
      const database =
        (options?.extra?.database as string) || api.config.getString("database", "WOS");

      const params: Record<string, unknown> = {
        q,
        db: database,
        limit: maxResults,
        page,
      };
      if (sortField) {
        params.sortField = `${sortField} DESC`;
      }

      const response = await api.http.get<any>(`${BASE}/documents`, {
        params,
        headers: { "X-ApiKey": key },
      });

      const hits: any[] = response.data.hits ?? [];
      const total: number = response.data.metadata?.total ?? 0;

      const items: ResourceItem[] = [];
      for (const hit of hits) {
        const item = parseRecord(api, hit);
        if (item) items.push(item);
      }

      return {
        platform: "wos",
        query,
        totalResults: total,
        items,
        page,
        elapsed: Date.now() - startTime,
        hasMore: total > page * maxResults,
      };
    },
  };
}

function buildQuery(query: string, options?: SearchOptions): string {
  const parts: string[] = [];

  const fieldTags = ["TS=", "TI=", "AU=", "SO=", "DO=", "PY="];
  const hasTag = fieldTags.some((t) => query.toUpperCase().includes(t));

  if (hasTag) {
    parts.push(query);
  } else {
    parts.push(`TS=(${escapeQuery(query)})`);
  }

  if (options?.year) {
    if (options.year.includes("-")) {
      const [start, end] = options.year.split("-");
      parts.push(`PY=(${start.trim()}-${end.trim()})`);
    } else {
      parts.push(`PY=${options.year}`);
    }
  }
  if (options?.author) {
    parts.push(`AU=(${escapeQuery(options.author)})`);
  }

  return parts.join(" AND ");
}

function escapeQuery(value: string): string {
  return value.replace(/['"\\]/g, "");
}

function mapSortField(sortBy?: string): string | undefined {
  switch (sortBy) {
    case "date":
      return "PD";
    case "citations":
      return "TC";
    case "relevance":
      return "relevance";
    default:
      return undefined;
  }
}

function parseRecord(api: ProviderAPI, rec: any): ResourceItem | null {
  try {
    const title: string = rec.title ?? "Untitled";
    const doi: string = rec.identifiers?.doi ?? "";
    const year: number | undefined = rec.source?.publishYear;

    const authors: any[] = rec.names?.authors ?? [];
    const creators: ResourceItem["creators"] = authors.map((a: any) => {
      const displayName: string = a.displayName ?? "";
      return splitAuthorName(displayName);
    });

    const date = year ? `${year}` : undefined;
    const citationCount: number =
      rec.citations?.[0]?.citingArticlesCount ?? rec.citations?.[0]?.count ?? 0;

    const extraParts: string[] = [];
    if (rec.uid) extraParts.push(`WOS UT: ${rec.uid}`);
    if (citationCount > 0) {
      extraParts.push(`Citations: ${citationCount}`);
    }

    return {
      itemType: "journalArticle",
      title,
      creators,
      abstractNote: rec.abstract ?? undefined,
      date,
      DOI: doi || undefined,
      url: `https://www.webofscience.com/wos/woscc/full-record/${rec.uid}`,
      publicationTitle: rec.source?.sourceTitle ?? undefined,
      extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
      source: "wos",
      citationCount,
    };
  } catch (error) {
    api.log.warn("Failed to parse WoS record", error);
    return null;
  }
}

function splitAuthorName(displayName: string): {
  firstName?: string;
  lastName: string;
  creatorType: string;
} {
  const commaIdx = displayName.indexOf(",");
  if (commaIdx > 0) {
    const lastName = displayName.substring(0, commaIdx).trim();
    const firstName = displayName.substring(commaIdx + 1).trim();
    return { firstName: firstName || undefined, lastName, creatorType: "author" };
  }
  const parts = displayName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { lastName: displayName.trim(), creatorType: "author" };
  }
  const lastName = parts.pop()!;
  const firstName = parts.join(" ");
  return { firstName, lastName, creatorType: "author" };
}
