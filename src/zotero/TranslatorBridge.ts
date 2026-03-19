import { logger } from "../infra/Logger";

const CROSSREF_REST_TRANSLATOR_ID = "b28d0d42-8549-4c6d-83fc-8382874a5cb9";

export class TranslatorBridge {
  async addByDOI(
    doi: string,
    collectionKey?: string,
    extraTags?: string[],
  ): Promise<{ key: string; title: string } | null> {
    try {
      const translator = new Zotero.Translate.Search();
      translator.setSearch({ DOI: doi });
      translator.setTranslator(CROSSREF_REST_TRANSLATOR_ID);

      const libraryID = Zotero.Libraries.userLibraryID;
      let savedItem: any = null;

      translator.setHandler("itemDone", (_obj: any, item: any) => {
        savedItem = item;
      });

      const items = await translator.translate({ libraryID, saveAttachments: false });

      const resultItem = savedItem || (items && items.length > 0 ? items[0] : null);
      if (!resultItem) {
        logger.warn(`Translator returned no items for DOI: ${doi}`);
        return null;
      }

      if (collectionKey) {
        try {
          const col = Zotero.Collections.getByLibraryAndKey(libraryID, collectionKey);
          if (col) {
            resultItem.addToCollection(col.id);
            await resultItem.saveTx();
          }
        } catch (e) {
          logger.warn(`Failed to add translated item to collection: ${e}`);
        }
      }

      if (extraTags?.length) {
        try {
          const existing: any[] = resultItem.getTags?.() || [];
          const tagSet = new Set<string>();
          for (const t of existing) tagSet.add(String(t.tag ?? t));
          for (const t of extraTags) tagSet.add(t);
          resultItem.setTags([...tagSet].map((tag) => ({ tag, type: 0 })) as any);
          await resultItem.saveTx();
        } catch (e) {
          logger.warn(`Failed to add tags to translated item: ${e}`);
        }
      }

      const title = (resultItem.getField?.("title") as string) || doi;
      logger.info(`Item added via translator (DOI): ${resultItem.key} - ${title}`);
      return { key: resultItem.key, title };
    } catch (e) {
      logger.error(`Translator addByDOI failed for ${doi}: ${e}`);
      return null;
    }
  }

  async lookupByDOI(doi: string): Promise<any | null> {
    try {
      const translator = new Zotero.Translate.Search();
      translator.setSearch({ DOI: doi });
      translator.setTranslator(CROSSREF_REST_TRANSLATOR_ID);

      const items = await translator.translate({ libraryID: false, saveAttachments: false });
      return items && items.length > 0 ? items[0] : null;
    } catch (e) {
      logger.error(`Translator lookupByDOI failed for ${doi}: ${e}`);
      return null;
    }
  }

  async addByURL(
    url: string,
    collectionKey?: string,
    extraTags?: string[],
  ): Promise<{ key: string; title: string } | null> {
    const doiMatch = url.match(/(?:doi\.org\/|\/doi\/)?(10\.\d{4,}\/[^\s]+)/i);
    if (doiMatch) {
      logger.info(`Extracted DOI from URL: ${doiMatch[1]}`);
      return this.addByDOI(doiMatch[1], collectionKey, extraTags);
    }

    logger.info(`No DOI extractable from URL, web translator not yet supported: ${url}`);
    return null;
  }
}

export const translatorBridge = new TranslatorBridge();
