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
      for (const attId of existingAttachments) {
        const att = Zotero.Items.get(attId);
        if (att && att.attachmentContentType === "application/pdf") {
          const filename = att.attachmentFilename || "existing.pdf";
          return { ok: true, itemKey: att.key, filename, message: "PDF already attached" };
        }
      }

      const resolverResult = await this.tryZoteroResolvers(item);
      if (resolverResult) {
        return { ok: true, itemKey: resolverResult.key, filename: resolverResult.attachmentFilename, message: "PDF fetched via Zotero resolvers" };
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
}

export const pdfFetcher = new PdfFetcher();
