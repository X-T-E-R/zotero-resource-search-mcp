import type { ResourceItem } from "../models/types";
import { logger } from "../infra/Logger";

export class ItemCreator {
  async createFromResourceItem(
    resource: ResourceItem,
    collectionKey?: string,
    extraTags?: string[],
  ): Promise<{ key: string; title: string }> {
    const item = new Zotero.Item((resource.itemType || "journalArticle") as any);

    item.setField("title", resource.title);
    if (resource.date) item.setField("date", resource.date);
    if (resource.DOI) item.setField("DOI", resource.DOI);
    if (resource.url) item.setField("url", resource.url);
    if (resource.abstractNote) item.setField("abstractNote", resource.abstractNote);
    if (resource.publicationTitle) item.setField("publicationTitle", resource.publicationTitle);
    if (resource.volume) item.setField("volume", resource.volume);
    if (resource.issue) item.setField("issue", resource.issue);
    if (resource.pages) item.setField("pages", resource.pages);
    if (resource.ISSN) item.setField("ISSN", resource.ISSN);
    if (resource.ISBN) item.setField("ISBN", resource.ISBN);
    if (resource.language) item.setField("language", resource.language);
    if (resource.extra) item.setField("extra", resource.extra);

    if (resource.creators?.length) {
      item.setCreators(
        resource.creators.map((c) => ({
          firstName: c.firstName || "",
          lastName: c.lastName,
          creatorType: c.creatorType || "author",
        })) as any,
      );
    }

    const tagSet = new Set<string>();
    if (resource.tags?.length) {
      for (const t of resource.tags) tagSet.add(typeof t === "string" ? t : t.tag);
    }
    if (extraTags?.length) {
      for (const t of extraTags) tagSet.add(t);
    }
    if (tagSet.size > 0) {
      item.setTags([...tagSet].map((tag) => ({ tag, type: 0 })) as any);
    }

    if (collectionKey) {
      try {
        const col = Zotero.Collections.getByLibraryAndKey(
          Zotero.Libraries.userLibraryID,
          collectionKey,
        );
        if (col) item.addToCollection(col.id);
      } catch (e) {
        logger.warn(`Failed to add to collection ${collectionKey}: ${e}`);
      }
    }

    await item.saveTx();
    logger.info(`Item created: ${item.key} - ${resource.title}`);
    return { key: item.key, title: resource.title };
  }
}

export const itemCreator = new ItemCreator();
