import type { ResourceItem } from "../models/types";
import { translatorBridge } from "../zotero/TranslatorBridge";
import { logger } from "../infra/Logger";

export class LookupAction {
  async execute(
    identifier: string,
    identifierType?: string,
  ): Promise<ResourceItem | null> {
    const type = identifierType || this.detectIdentifierType(identifier);
    logger.info(`Lookup: ${type} = ${identifier}`);

    const endTimer = logger.time(`Lookup ${type}:${identifier}`);

    try {
      const result = await this.lookupViaTranslator(identifier, type);
      endTimer();
      return result;
    } catch (e) {
      endTimer();
      logger.error(`Lookup failed for ${type}:${identifier}: ${e}`);
      return null;
    }
  }

  private detectIdentifierType(identifier: string): string {
    const trimmed = identifier.trim();

    if (/^10\.\d{4,}\//.test(trimmed)) return "doi";

    if (/^(arxiv:)?\d{4}\.\d{4,}/i.test(trimmed)) return "arxiv";
    if (/^(arxiv:)/i.test(trimmed)) return "arxiv";

    if (/^97[89]\d{10,}$/.test(trimmed.replace(/-/g, ""))) return "isbn";

    if (/^\d+$/.test(trimmed) && trimmed.length >= 4 && trimmed.length <= 12) return "pmid";

    return "doi";
  }

  private async lookupViaTranslator(
    identifier: string,
    type: string,
  ): Promise<ResourceItem | null> {
    if (type === "doi") {
      return this.lookupDOI(identifier);
    }
    if (type === "pmid") {
      return this.lookupPMID(identifier);
    }
    if (type === "isbn") {
      return this.lookupISBN(identifier);
    }
    if (type === "arxiv") {
      return this.lookupArXiv(identifier);
    }

    logger.warn(`Unsupported identifier type: ${type}, trying as DOI`);
    return this.lookupDOI(identifier);
  }

  private async lookupDOI(doi: string): Promise<ResourceItem | null> {
    const item = await translatorBridge.lookupByDOI(doi);
    if (!item) return null;
    return this.zoteroItemToResourceItem(item, "doi-lookup");
  }

  private async lookupPMID(pmid: string): Promise<ResourceItem | null> {
    try {
      const translator = new Zotero.Translate.Search();
      translator.setSearch({ PMID: pmid });

      const translators = await translator.getTranslators();
      if (translators.length === 0) {
        logger.warn("No translator found for PMID lookup");
        return null;
      }

      translator.setTranslator(translators[0]);
      const items = await translator.translate({ libraryID: false, saveAttachments: false });
      if (!items || items.length === 0) return null;
      return this.zoteroItemToResourceItem(items[0], "pmid-lookup");
    } catch (e) {
      logger.error(`PMID lookup failed: ${e}`);
      return null;
    }
  }

  private async lookupISBN(isbn: string): Promise<ResourceItem | null> {
    try {
      const translator = new Zotero.Translate.Search();
      translator.setSearch({ ISBN: isbn });

      const translators = await translator.getTranslators();
      if (translators.length === 0) {
        logger.warn("No translator found for ISBN lookup");
        return null;
      }

      translator.setTranslator(translators[0]);
      const items = await translator.translate({ libraryID: false, saveAttachments: false });
      if (!items || items.length === 0) return null;
      return this.zoteroItemToResourceItem(items[0], "isbn-lookup");
    } catch (e) {
      logger.error(`ISBN lookup failed: ${e}`);
      return null;
    }
  }

  private async lookupArXiv(arxivId: string): Promise<ResourceItem | null> {
    const cleanId = arxivId.replace(/^arxiv:/i, "").trim();
    const doi = `10.48550/arXiv.${cleanId}`;
    const result = await this.lookupDOI(doi);
    if (result) {
      result.source = "arxiv-lookup";
      return result;
    }
    return null;
  }

  private zoteroItemToResourceItem(item: any, source: string): ResourceItem {
    const get = (field: string): string | undefined => {
      try {
        const val = item.getField?.(field) ?? item[field];
        return val ? String(val) : undefined;
      } catch {
        return undefined;
      }
    };

    let creators: ResourceItem["creators"];
    try {
      const rawCreators = item.getCreators?.() ?? item.creators ?? [];
      creators = rawCreators.map((c: any) => ({
        firstName: c.firstName || "",
        lastName: c.lastName || c.name || "",
        creatorType: c.creatorType || "author",
      }));
    } catch {
      creators = [];
    }

    let tags: ResourceItem["tags"];
    try {
      const rawTags = item.getTags?.() ?? item.tags ?? [];
      tags = rawTags.map((t: any) => (typeof t === "string" ? { tag: t } : { tag: t.tag }));
    } catch {
      tags = [];
    }

    return {
      itemType: get("itemType") || item.itemType || "journalArticle",
      title: get("title") || "Untitled",
      creators,
      date: get("date"),
      DOI: get("DOI"),
      url: get("url"),
      abstractNote: get("abstractNote"),
      publicationTitle: get("publicationTitle"),
      volume: get("volume"),
      issue: get("issue"),
      pages: get("pages"),
      ISSN: get("ISSN"),
      ISBN: get("ISBN"),
      language: get("language"),
      extra: get("extra"),
      tags,
      source,
    };
  }
}

export const lookupAction = new LookupAction();
