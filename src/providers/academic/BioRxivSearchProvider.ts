import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import type { ResourceItem, SearchProvider, SearchOptions, SearchResult } from "../../models/types";
import { providerRegistry } from "../registry";

export class BioRxivSearchProvider implements SearchProvider {
  readonly id: string = "biorxiv";
  readonly name: string = "bioRxiv";
  readonly sourceType = "academic" as const;

  private http = new HttpClient({
    baseURL: "https://api.biorxiv.org/details/biorxiv",
    timeout: 30_000,
  });

  isAvailable(): boolean {
    return configProvider.getBool("platform.biorxiv.enabled", true);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const startTime = Date.now();
    const maxResults = options?.maxResults ?? 10;
    const page = options?.page ?? 1;
    const days = (options?.extra?.days as number) ?? 30;

    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const startDate = start.toISOString().split("T")[0];
    const endDate = end.toISOString().split("T")[0];
    const cursor = (page - 1) * maxResults;

    try {
      const response = await this.http.get<any>(`/${startDate}/${endDate}/${cursor}`);
      const collection: any[] = response.data?.collection ?? [];

      let items: ResourceItem[] = [];
      for (const raw of collection) {
        const item = this.parseItem(raw);
        if (item) items.push(item);
      }

      if (query && query !== "*" && query.trim()) {
        const qLower = query.toLowerCase();
        items = items.filter(
          (it) =>
            it.title.toLowerCase().includes(qLower) ||
            (it.abstractNote ?? "").toLowerCase().includes(qLower) ||
            it.creators?.some((c) => `${c.firstName ?? ""} ${c.lastName}`.toLowerCase().includes(qLower)),
        );
      }

      if (options?.extra?.category) {
        const cat = String(options.extra.category).toLowerCase();
        items = items.filter((it) => it.tags?.some((t) => t.tag.toLowerCase().includes(cat)));
      }

      const totalFiltered = items.length;
      items = items.slice(0, maxResults);

      return {
        platform: this.id,
        query,
        totalResults: totalFiltered,
        items,
        page,
        elapsed: Date.now() - startTime,
        hasMore: totalFiltered > maxResults,
      };
    } catch (error: any) {
      logger.error("bioRxiv search failed", error?.message);
      throw error;
    }
  }

  private parseItem(raw: any): ResourceItem | null {
    if (!raw?.title) return null;
    try {
      const doi: string = raw.doi ?? "";
      const authorStr: string = raw.authors ?? "";
      const creators: ResourceItem["creators"] = authorStr
        .split(";")
        .map((a: string) => a.trim())
        .filter(Boolean)
        .map((name: string) => {
          const parts = name.split(",").map((s: string) => s.trim());
          if (parts.length >= 2) {
            return { lastName: parts[0], firstName: parts.slice(1).join(" "), creatorType: "author" as const };
          }
          return { lastName: name, creatorType: "author" as const };
        });

      const version: string = raw.version ?? "1";
      const url = `https://www.biorxiv.org/content/${doi}v${version}`;
      const pdfUrl = `${url}.full.pdf`;
      const date = raw.date ?? undefined;

      const extraParts: string[] = [];
      if (raw.category) extraParts.push(`Category: ${raw.category}`);
      extraParts.push(`Version: ${version}`);
      extraParts.push(`PDF: ${pdfUrl}`);

      return {
        itemType: "preprint",
        title: raw.title,
        creators,
        abstractNote: raw.abstract || undefined,
        date,
        DOI: doi || undefined,
        url,
        tags: raw.category ? [{ tag: raw.category }] : undefined,
        extra: extraParts.join("\n"),
        source: "biorxiv",
      };
    } catch {
      return null;
    }
  }
}

export class MedRxivSearchProvider extends BioRxivSearchProvider {
  override readonly id = "medrxiv";
  override readonly name = "medRxiv";

  private medHttp = new HttpClient({
    baseURL: "https://api.biorxiv.org/details/medrxiv",
    timeout: 30_000,
  });

  override isAvailable(): boolean {
    return configProvider.getBool("platform.medrxiv.enabled", true);
  }

  override async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const origHttp = (this as any).http;
    (this as any).http = this.medHttp;
    try {
      const result = await super.search(query, options);
      result.platform = this.id;
      for (const item of result.items) {
        item.source = "medrxiv";
        if (item.url) item.url = item.url.replace("biorxiv.org", "medrxiv.org");
        if (item.extra) item.extra = item.extra.replace(/biorxiv\.org/g, "medrxiv.org");
      }
      return result;
    } finally {
      (this as any).http = origHttp;
    }
  }
}

providerRegistry.registerSearchProvider(new BioRxivSearchProvider());
providerRegistry.registerSearchProvider(new MedRxivSearchProvider());
