import { HttpClient } from "../../infra/HttpClient";
import { configProvider } from "../../infra/ConfigProvider";
import { logger } from "../../infra/Logger";
import { parseCrossrefItem } from "../shared/crossrefParse";
import type { ResourceItem, MetadataResolver } from "../../models/types";
import { providerRegistry } from "../registry";

const BASE_URL = "https://api.crossref.org/works";

export class CrossrefResolver implements MetadataResolver {
  readonly name = "crossref";
  readonly supportedIdentifiers = ["doi"];

  private http = new HttpClient({ baseURL: BASE_URL, timeout: 30_000 });

  async resolve(identifier: string, type?: string): Promise<ResourceItem | null> {
    const doi = this.sanitizeDoi(identifier);
    if (!doi) {
      logger.warn("Invalid DOI provided to CrossrefResolver", identifier);
      return null;
    }

    const mailto = configProvider.getString("api.crossref.mailto", "paper-search-mcp@example.com");

    try {
      const response = await this.http.get<any>(`/${encodeURIComponent(doi)}`, {
        params: { mailto },
      });

      if (response.data?.message) {
        return parseCrossrefItem(response.data.message);
      }
      return null;
    } catch (error: any) {
      if (error?.status === 404) {
        logger.info("DOI not found in Crossref", doi);
        return null;
      }
      logger.error("CrossrefResolver failed", error?.message);
      throw error;
    }
  }

  private sanitizeDoi(doi: string): string | null {
    let cleaned = doi.trim();
    if (cleaned.startsWith("https://doi.org/")) {
      cleaned = cleaned.substring("https://doi.org/".length);
    } else if (cleaned.startsWith("http://doi.org/")) {
      cleaned = cleaned.substring("http://doi.org/".length);
    } else if (cleaned.startsWith("doi:")) {
      cleaned = cleaned.substring("doi:".length);
    }

    cleaned = cleaned.trim();

    if (/^10\.\d{4,}\/\S+$/.test(cleaned)) {
      return cleaned;
    }

    return null;
  }
}

providerRegistry.registerResolver(new CrossrefResolver());
