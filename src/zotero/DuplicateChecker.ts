import type { ResourceItem } from "../models/types";
import { logger } from "../infra/Logger";

export interface DuplicateResult {
  isDuplicate: boolean;
  existingKey?: string;
  existingTitle?: string;
  existingCollections?: string[];
}

export class DuplicateChecker {
  async check(resource: ResourceItem): Promise<DuplicateResult> {
    if (resource.itemType === "patent") {
      for (const [field, value] of [
        ["applicationNumber", resource.applicationNumber],
        ["patentNumber", resource.patentNumber],
      ] as const) {
        const trimmed = value?.trim();
        if (!trimmed) continue;
        try {
          const s = new Zotero.Search({ libraryID: Zotero.Libraries.userLibraryID });
          s.addCondition(field, "is", trimmed);
          const ids = await s.search();
          if (ids.length > 0) {
            return this.buildResult(ids[0]);
          }
        } catch (e) {
          logger.warn(`${field} duplicate check failed: ${e}`);
        }
      }
    }

    if (resource.DOI) {
      try {
        const s = new Zotero.Search({ libraryID: Zotero.Libraries.userLibraryID });
        s.addCondition("DOI", "is", resource.DOI);
        const ids = await s.search();
        if (ids.length > 0) {
          return this.buildResult(ids[0]);
        }
      } catch (e) {
        logger.warn(`DOI duplicate check failed: ${e}`);
      }
    }

    if (resource.title) {
      try {
        const s = new Zotero.Search({ libraryID: Zotero.Libraries.userLibraryID });
        s.addCondition("title", "is", resource.title);
        const ids = await s.search();
        if (ids.length > 0) {
          return this.buildResult(ids[0]);
        }
      } catch (e) {
        logger.warn(`Title duplicate check failed: ${e}`);
      }
    }

    return { isDuplicate: false };
  }

  private buildResult(itemID: number): DuplicateResult {
    const item = Zotero.Items.get(itemID);
    const collections = item.getCollections?.() ?? [];
    const collectionKeys = collections
      .map((colId: number) => {
        try {
          const col = Zotero.Collections.get(colId);
          return col?.key ?? null;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];

    return {
      isDuplicate: true,
      existingKey: item.key,
      existingTitle: item.getField("title") as string,
      existingCollections: collectionKeys,
    };
  }
}

export const duplicateChecker = new DuplicateChecker();
