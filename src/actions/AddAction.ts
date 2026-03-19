import type { ResourceItem } from "../models/types";
import { duplicateChecker } from "../zotero/DuplicateChecker";
import { translatorBridge } from "../zotero/TranslatorBridge";
import { itemCreator } from "../zotero/ItemCreator";
import { collectionHelper } from "../zotero/CollectionHelper";
import { pdfFetcher } from "../zotero/PdfFetcher";
import { configProvider } from "../infra/ConfigProvider";
import { logger } from "../infra/Logger";

export interface AddResult {
  ok: boolean;
  key?: string;
  title?: string;
  message?: string;
  duplicate?: boolean;
  addedToCollection?: boolean;
  pdf?: { ok: boolean; message?: string };
}

export class AddAction {
  async execute(params: {
    item?: ResourceItem;
    url?: string;
    collectionKey?: string;
    collectionPath?: string;
    tags?: string[];
    fetchPDF?: boolean;
  }): Promise<AddResult> {
    const { item, url, tags } = params;
    const fetchPDF = params.fetchPDF ?? configProvider.getBool("general.fetchPDF", false);

    if (!item && !url) {
      return { ok: false, message: "Either item or url must be provided" };
    }

    const endTimer = logger.time("AddAction");

    try {
      const resolvedCollectionKey = this.resolveCollection(params.collectionKey, params.collectionPath);

      if (item) {
        const dupResult = await duplicateChecker.check(item);
        if (dupResult.isDuplicate && dupResult.existingKey) {
          if (resolvedCollectionKey) {
            const alreadyInTarget = dupResult.existingCollections?.includes(resolvedCollectionKey) ?? false;
            if (!alreadyInTarget) {
              const added = await collectionHelper.addItemToCollection(dupResult.existingKey, resolvedCollectionKey);
              endTimer();
              let result: AddResult = {
                ok: true,
                duplicate: true,
                key: dupResult.existingKey,
                title: dupResult.existingTitle,
                addedToCollection: added,
                message: added
                  ? `Item already exists, added to new collection`
                  : `Item already exists, failed to add to new collection`,
              };
              if (fetchPDF) {
                result.pdf = await pdfFetcher.fetchForItem(dupResult.existingKey);
              }
              return result;
            }
          }

          endTimer();
          return {
            ok: false,
            duplicate: true,
            key: dupResult.existingKey,
            title: dupResult.existingTitle,
            message: `Duplicate found: "${dupResult.existingTitle}" (${dupResult.existingKey})`,
          };
        }
      }

      let addedKey: string | undefined;
      let addedTitle: string | undefined;
      let addedMsg: string | undefined;

      if (item?.DOI) {
        const result = await translatorBridge.addByDOI(item.DOI, resolvedCollectionKey, tags);
        if (result) {
          addedKey = result.key;
          addedTitle = result.title;
          addedMsg = "Added via DOI translator";
        } else {
          logger.info("DOI translator failed, trying next level");
        }
      }

      if (!addedKey && url) {
        const result = await translatorBridge.addByURL(url, resolvedCollectionKey, tags);
        if (result) {
          addedKey = result.key;
          addedTitle = result.title;
          addedMsg = "Added via URL translator";
        } else {
          logger.info("URL translator failed, trying manual creation");
        }
      }

      if (!addedKey && item) {
        const result = await itemCreator.createFromResourceItem(item, resolvedCollectionKey, tags);
        addedKey = result.key;
        addedTitle = result.title;
        addedMsg = "Added via manual creation";
      }

      if (!addedKey) {
        endTimer();
        return { ok: false, message: "Unable to add resource" };
      }

      endTimer();
      const addResult: AddResult = { ok: true, key: addedKey, title: addedTitle, message: addedMsg };

      if (fetchPDF && addedKey) {
        addResult.pdf = await pdfFetcher.fetchForItem(addedKey);
      }

      return addResult;
    } catch (e) {
      endTimer();
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error(`AddAction failed: ${errMsg}`);
      return { ok: false, message: `Failed to add resource: ${errMsg}` };
    }
  }

  private resolveCollection(key?: string, path?: string): string | undefined {
    if (key) {
      const resolved = collectionHelper.resolveKey(key);
      return resolved ?? key;
    }
    if (path) {
      const resolved = collectionHelper.resolveByPath(path);
      return resolved ?? undefined;
    }
    return undefined;
  }
}

export const addAction = new AddAction();
