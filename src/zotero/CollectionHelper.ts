import { logger } from "../infra/Logger";

export interface CollectionNode {
  key: string;
  name: string;
  parentKey: string | null;
  itemCount: number;
  children: CollectionNode[];
}

export class CollectionHelper {
  listTree(): CollectionNode[] {
    const libraryID = Zotero.Libraries.userLibraryID;
    const allCollections = Zotero.Collections.getByLibrary(libraryID);
    const byParent = new Map<number | null, any[]>();

    for (const col of allCollections) {
      const pid = (col as any).parentID ?? null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid)!.push(col);
    }

    const buildTree = (parentID: number | null): CollectionNode[] => {
      const children = byParent.get(parentID) || [];
      return children.map((col: any) => ({
        key: col.key as string,
        name: col.name as string,
        parentKey: col.parentKey ?? null,
        itemCount: col.getChildItems(false)?.length ?? 0,
        children: buildTree(col.id),
      }));
    };

    return buildTree(null);
  }

  listFlat(): Array<{ key: string; name: string; path: string; itemCount: number }> {
    const tree = this.listTree();
    const result: Array<{ key: string; name: string; path: string; itemCount: number }> = [];

    const walk = (nodes: CollectionNode[], prefix: string) => {
      for (const n of nodes) {
        const path = prefix ? `${prefix}/${n.name}` : n.name;
        result.push({ key: n.key, name: n.name, path, itemCount: n.itemCount });
        walk(n.children, path);
      }
    };

    walk(tree, "");
    return result;
  }

  resolveByPath(path: string): string | null {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    const libraryID = Zotero.Libraries.userLibraryID;
    const allCollections = Zotero.Collections.getByLibrary(libraryID);

    let currentParentID: number | null = null;

    for (const part of parts) {
      const match = allCollections.find(
        (c: any) =>
          c.name.toLowerCase() === part.toLowerCase() &&
          ((c as any).parentID ?? null) === currentParentID,
      );
      if (!match) {
        logger.warn(
          `Collection path segment not found: "${part}" under parentID=${currentParentID}`,
        );
        return null;
      }
      currentParentID = (match as any).id;
    }

    if (currentParentID === null) return null;

    const resolved = allCollections.find((c: any) => (c as any).id === currentParentID);
    return resolved ? (resolved.key as string) : null;
  }

  resolveKey(keyOrPath: string): string | null {
    if (!keyOrPath.includes("/")) {
      const libraryID = Zotero.Libraries.userLibraryID;
      try {
        const col = Zotero.Collections.getByLibraryAndKey(libraryID, keyOrPath);
        if (col) return keyOrPath;
      } catch {
        /* not a key */
      }
    }
    return this.resolveByPath(keyOrPath);
  }

  isItemInCollection(itemKey: string, collectionKey: string): boolean {
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const col = Zotero.Collections.getByLibraryAndKey(libraryID, collectionKey);
      if (!col) return false;
      const items = col.getChildItems(false) || [];
      return items.some((it: any) => it.key === itemKey);
    } catch {
      return false;
    }
  }

  async addItemToCollection(itemKey: string, collectionKey: string): Promise<boolean> {
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const col = Zotero.Collections.getByLibraryAndKey(libraryID, collectionKey);
      if (!col) return false;
      const item = Zotero.Items.getByLibraryAndKey(libraryID, itemKey);
      if (!item) return false;
      item.addToCollection(col.id);
      await item.saveTx();
      return true;
    } catch (e) {
      logger.error(`Failed to add item ${itemKey} to collection ${collectionKey}: ${e}`);
      return false;
    }
  }
}

export const collectionHelper = new CollectionHelper();
