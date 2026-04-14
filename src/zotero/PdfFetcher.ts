import { logger } from "../infra/Logger";

export interface PdfResult {
  ok: boolean;
  itemKey?: string;
  filename?: string;
  message?: string;
}

export class PdfFetcher {
  async fetchForItem(itemKey: string): Promise<PdfResult> {
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const item = Zotero.Items.getByLibraryAndKey(libraryID, itemKey);
      if (!item) {
        return { ok: false, message: `Item not found: ${itemKey}` };
      }

      if (item.isAttachment()) {
        return { ok: false, message: "Cannot fetch PDF for an attachment item" };
      }

      const existingAttachments = item.getAttachments();
      const existingAttachmentIDs = new Set<number>(existingAttachments);
      const existingPdf = this.findPdfAttachment(item);
      if (existingPdf) {
        const filename = existingPdf.attachmentFilename || "existing.pdf";
        return { ok: true, itemKey: existingPdf.key, filename, message: "PDF already attached" };
      }

      const resolverResult = await this.tryZoteroResolvers(item);
      const resolvedAttachment = await this.resolveAttachmentAfterFetch(
        item,
        existingAttachmentIDs,
      );
      if (resolvedAttachment) {
        return {
          ok: true,
          filename: resolvedAttachment.attachmentFilename || "downloaded.pdf",
          message: "PDF fetched via Zotero resolvers",
        };
      }

      return { ok: false, message: "Could not find accessible PDF" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`PdfFetcher failed for ${itemKey}: ${msg}`);
      return { ok: false, message: `PDF fetch error: ${msg}` };
    }
  }

  private async tryZoteroResolvers(parentItem: any): Promise<any | null> {
    try {
      return await (Zotero.Attachments as any).addAvailablePDF(parentItem);
    } catch (e) {
      logger.info(`PDF via Zotero resolvers failed: ${e}`);
      return null;
    }
  }

  private findPdfAttachment(parentItem: any, newOnlyIDs?: Set<number>): any | null {
    const attachmentIDs = parentItem.getAttachments() || [];
    for (const attId of attachmentIDs) {
      if (newOnlyIDs && !newOnlyIDs.has(attId)) {
        continue;
      }
      const att = Zotero.Items.get(attId);
      if (att && att.attachmentContentType === "application/pdf") {
        return att;
      }
    }
    return null;
  }

  private async resolveAttachmentAfterFetch(
    parentItem: any,
    existingAttachmentIDs: Set<number>,
  ): Promise<any | null> {
    for (let attempt = 0; attempt < 60; attempt++) {
      const dbAttachment = await this.findCommittedPdfAttachment(
        parentItem.id,
        existingAttachmentIDs,
      );
      if (dbAttachment) {
        return dbAttachment;
      }

      const refreshedItem = await this.refreshParentItem(parentItem);
      const latestAttachmentIDs = new Set<number>(
        (refreshedItem.getAttachments() || []).filter(
          (attId: number) => !existingAttachmentIDs.has(attId),
        ),
      );
      const newPdf = this.findPdfAttachment(refreshedItem, latestAttachmentIDs);
      if (newPdf && (await this.isReadyPdfAttachment(newPdf))) {
        return newPdf;
      }

      if (typeof refreshedItem.getBestAttachment === "function") {
        const bestAttachment = await refreshedItem.getBestAttachment();
        if (
          bestAttachment &&
          !existingAttachmentIDs.has(bestAttachment.id) &&
          bestAttachment.attachmentContentType === "application/pdf" &&
          (await this.isReadyPdfAttachment(bestAttachment))
        ) {
          return bestAttachment;
        }
      }

      if (attempt < 59) {
        await this.delay(500);
      }
    }

    return null;
  }

  private async refreshParentItem(parentItem: any): Promise<any> {
    try {
      if (typeof parentItem.reload === "function") {
        await parentItem.reload(["primaryData", "childItems"], true);
        return parentItem;
      }
    } catch (e) {
      logger.info(`Parent item reload failed after PDF fetch: ${e}`);
    }

    try {
      const refreshed = Zotero.Items.getByLibraryAndKey(parentItem.libraryID, parentItem.key);
      if (refreshed && typeof refreshed.loadAllData === "function") {
        await refreshed.loadAllData(true);
      }
      return refreshed || parentItem;
    } catch (e) {
      logger.info(`Parent item refresh lookup failed after PDF fetch: ${e}`);
      return parentItem;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async isReadyPdfAttachment(attachment: any): Promise<boolean> {
    if (!attachment || attachment.attachmentContentType !== "application/pdf") {
      return false;
    }

    try {
      if (typeof attachment.fileExists === "function") {
        return await attachment.fileExists();
      }
    } catch (e) {
      logger.info(`Attachment readiness check failed: ${e}`);
    }

    return false;
  }

  private async findCommittedPdfAttachment(
    parentItemID: number,
    existingAttachmentIDs: Set<number>,
  ): Promise<any | null> {
    try {
      const rows = await Zotero.DB.queryAsync(
        `SELECT I.itemID AS itemID
         FROM items I
         JOIN itemAttachments IA ON IA.itemID = I.itemID
         WHERE IA.parentItemID = ?
           AND IA.contentType = ?
         ORDER BY I.itemID DESC`,
        [parentItemID, "application/pdf"],
      );

      for (const row of rows || []) {
        const itemID = Number((row as any).itemID);
        if (!Number.isFinite(itemID) || existingAttachmentIDs.has(itemID)) {
          continue;
        }
        const attachment = Zotero.Items.get(itemID);
        if (attachment && (await this.isReadyPdfAttachment(attachment))) {
          return attachment;
        }
      }
    } catch (e) {
      logger.info(`DB attachment lookup failed after PDF fetch: ${e}`);
    }

    return null;
  }
}

export const pdfFetcher = new PdfFetcher();
