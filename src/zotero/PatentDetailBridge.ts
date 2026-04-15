import type { PatentDetailPayload, PatentDetailResult, ResourceItem } from "../models/types";
import { logger } from "../infra/Logger";
import { secretStore } from "../infra/SecretStore";
import { joinPaths, writeBinaryFile } from "../providers/runtime/fsUtils";

interface StoredPatentDetail {
  item: ResourceItem;
  detail: PatentDetailPayload;
}

interface PersistedCookieRecord {
  name: string;
  value: string;
  host: string;
  path: string;
  isSecure?: boolean;
}

const PATENTSTAR_COOKIE_ORIGINS = [
  "https://www.patentstar.com.cn",
  "https://api.patentstar.com.cn",
];

export interface PatentLibraryMatch {
  id: number;
  key: string;
  title: string;
}

export interface PatentDetailSyncResult {
  notesCreated: number;
  attachmentsCreated: number;
  sectionsAdded: string[];
  pdf?: {
    ok: boolean;
    itemKey?: string;
    message?: string;
  };
}

function normalizeKey(value?: string): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}

function buildLookupKeys(item: ResourceItem): string[] {
  const keys = [
    normalizeKey(item.sourceId),
    normalizeKey(item.applicationNumber),
    normalizeKey(item.patentNumber),
    normalizeKey(item.title),
  ].filter(Boolean) as string[];
  return [...new Set(keys)];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function reportZoteroError(error: unknown): void {
  try {
    if (typeof Zotero.logError === "function") {
      Zotero.logError(error instanceof Error ? error : new Error(String(error)));
    }
  } catch {
    /* ignore */
  }
}

function createLocalFile(path: string): nsIFile {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  return file;
}

function normalizeCookieHost(host: string): string {
  return host.trim().replace(/^\./, "").toLowerCase();
}

function loadPersistedPatentCookies(): PersistedCookieRecord[] {
  const cookies: PersistedCookieRecord[] = [];
  for (const origin of PATENTSTAR_COOKIE_ORIGINS) {
    const raw = secretStore.getString(`http.cookieJar.${encodeURIComponent(origin)}`, "");
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object") continue;
        if (typeof entry.name !== "string" || typeof entry.value !== "string") continue;
        if (typeof entry.host !== "string" || typeof entry.path !== "string") continue;
        cookies.push(entry as PersistedCookieRecord);
      }
    } catch {
      /* ignore invalid persisted cookie jar */
    }
  }
  return cookies;
}

function buildPatentCookieHeader(url: string): string {
  try {
    const target = new URL(url);
    const pairs = new Map<string, string>();

    const cookies = Services.cookies.getCookiesFromHost(target.hostname, {}, true);
    for (const cookie of cookies as nsICookie[]) {
      if (!cookie?.name) continue;
      if (cookie.isSecure && target.protocol !== "https:") continue;
      const cookiePath = cookie.path || "/";
      if (!target.pathname.startsWith(cookiePath)) continue;
      pairs.set(cookie.name, cookie.value);
    }

    for (const cookie of loadPersistedPatentCookies()) {
      const host = normalizeCookieHost(cookie.host);
      if (!host) continue;
      const hostname = target.hostname.toLowerCase();
      const hostMatches = hostname === host || hostname.endsWith(`.${host}`);
      if (!hostMatches) continue;
      if (cookie.isSecure && target.protocol !== "https:") continue;
      const cookiePath = cookie.path || "/";
      if (!target.pathname.startsWith(cookiePath)) continue;
      pairs.set(cookie.name, cookie.value);
    }

    return [...pairs.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  } catch {
    return "";
  }
}

function createPatentCookieSandbox(url: string): Zotero.CookieSandbox | undefined {
  try {
    const target = new URL(url);
    const CookieSandboxCtor = (Zotero as any).CookieSandbox as
      | (new (browser: unknown, uri: string | URL, cookieData: string, userAgent: string) => Zotero.CookieSandbox)
      | undefined;
    if (!CookieSandboxCtor) {
      return undefined;
    }
    return new CookieSandboxCtor(
      null,
      target.origin,
      buildPatentCookieHeader(url),
      typeof navigator !== "undefined" ? navigator.userAgent : "",
    );
  } catch {
    return undefined;
  }
}

function buildTextHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "<p></p>";
  }

  return paragraphs
    .map((entry) => `<p>${escapeHtml(entry).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function buildHeadingHtml(level: 1 | 2, title: string): string {
  return `<h${level}>${escapeHtml(title)}</h${level}>`;
}

function buildNoteSectionHtml(title: string, body: string): string {
  return `<section>${buildHeadingHtml(2, title)}${body}</section>`;
}

function buildSummaryNoteHtml(marker: string, sections: Array<{ title: string; html: string }>): string {
  return [
    `<div data-zrs-patent-detail="${escapeHtml(marker)}">`,
    buildHeadingHtml(1, "专利详情"),
    sections.map((section) => buildNoteSectionHtml(section.title, section.html)).join(""),
    "</div>",
  ].join("");
}

function buildLegalStatusHtml(
  entries: Array<{ date?: string; status?: string; info?: string; code?: string }>,
): string {
  const items = entries
    .map((entry) => {
      const segments = [entry.date, entry.status, entry.info].filter(Boolean);
      const label = escapeHtml(segments.join(" | "));
      const suffix = entry.code ? ` <code>${escapeHtml(entry.code)}</code>` : "";
      return `<li>${label}${suffix}</li>`;
    })
    .join("");
  return `<ul>${items}</ul>`;
}

function buildUrlListHtml(urls: string[]): string {
  const items = urls
    .map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function findExistingAttachmentByUrl(parentItem: Zotero.Item, url: string): Zotero.Item | null {
  const attachmentIDs = parentItem.getAttachments() || [];
  for (const attachmentID of attachmentIDs) {
    const attachment = Zotero.Items.get(attachmentID);
    if (!attachment) continue;
    if (attachment.getField("url") === url) {
      return attachment;
    }
    if (
      attachment.attachmentContentType === "application/pdf" &&
      attachment.getField("title") === "全文 PDF"
    ) {
      return attachment;
    }
  }
  return null;
}

class PatentDetailBridge {
  private readonly detailStore = new Map<string, StoredPatentDetail>();
  private pdfQueue: Promise<void> = Promise.resolve();

  remember(result: PatentDetailResult): void {
    const keys = buildLookupKeys(result.item);
    for (const key of keys) {
      this.detailStore.set(key, { item: result.item, detail: result.detail });
    }
  }

  recall(item: ResourceItem): StoredPatentDetail | undefined {
    for (const key of buildLookupKeys(item)) {
      const stored = this.detailStore.get(key);
      if (stored) {
        return stored;
      }
    }
    return undefined;
  }

  async findExistingItem(item: ResourceItem): Promise<PatentLibraryMatch | null> {
    const libraryID = Zotero.Libraries.userLibraryID;
    const candidates: Array<[string, string | undefined]> = [
      ["applicationNumber", item.applicationNumber],
      ["patentNumber", item.patentNumber],
      ["title", item.title],
    ];

    for (const [field, value] of candidates) {
      const trimmed = value?.trim();
      if (!trimmed) continue;
      try {
        const search = new Zotero.Search({ libraryID });
        search.addCondition(field, "is", trimmed);
        const ids = await search.search();
        const first = Array.isArray(ids) ? ids[0] : undefined;
        if (typeof first === "number") {
          const existing = Zotero.Items.get(first);
          if (existing) {
            return {
              id: existing.id,
              key: existing.key,
              title: existing.getField("title"),
            };
          }
        }
      } catch (error) {
        logger.warn(`Patent duplicate lookup failed for ${field}: ${error}`);
      }
    }

    return null;
  }

  async syncToItem(
    itemKey: string,
    detail: PatentDetailPayload,
    options?: { attachPdf?: boolean },
  ): Promise<PatentDetailSyncResult> {
    const result: PatentDetailSyncResult = {
      notesCreated: 0,
      attachmentsCreated: 0,
      sectionsAdded: [],
    };
    const parentItem = Zotero.Items.getByLibraryAndKey(Zotero.Libraries.userLibraryID, itemKey);
    if (!parentItem) {
      return result;
    }

    const noteSections: Array<{ title: string; html: string }> = [];

    if (detail.legalStatus?.entries?.length) {
      noteSections.push({
        title: "法律状态",
        html: buildLegalStatusHtml(detail.legalStatus.entries),
      });
    }

    if (detail.claims?.text?.trim()) {
      noteSections.push({
        title: "权利要求",
        html: buildTextHtml(detail.claims.text),
      });
    }

    if (detail.description?.text?.trim()) {
      noteSections.push({
        title: "说明书",
        html: buildTextHtml(detail.description.text),
      });
    }

    if (detail.pdf?.urls?.length) {
      noteSections.push({
        title: "PDF 链接",
        html: buildUrlListHtml(detail.pdf.urls),
      });
    }

    if (detail.images?.urls?.length) {
      noteSections.push({
        title: "附图链接",
        html: buildUrlListHtml(detail.images.urls),
      });
    }

    if (noteSections.length > 0) {
      const created = await this.upsertSummaryNote(parentItem, noteSections);
      result.notesCreated += created ? 1 : 0;
      result.sectionsAdded.push("note");
    }

    if (options?.attachPdf && detail.pdf?.urls?.length) {
      result.pdf = this.queuePdfAttachment(parentItem, detail.pdf.urls[0]);
      if (result.pdf.message === "PDF already attached") {
        result.sectionsAdded.push("pdf");
      } else if (result.pdf.ok) {
        result.sectionsAdded.push("pdf-queued");
      }
    }

    return result;
  }

  private async upsertSummaryNote(
    parentItem: Zotero.Item,
    sections: Array<{ title: string; html: string }>,
  ): Promise<boolean> {
    const html = buildSummaryNoteHtml("summary", sections);
    const existingNote = this.findExistingNoteByMarker(parentItem, "summary");

    if (existingNote) {
      existingNote.setNote(html);
      await existingNote.saveTx();
      return false;
    }

    const noteItem = new Zotero.Item("note");
    noteItem.parentItemID = parentItem.id;
    noteItem.setNote(html);
    await noteItem.saveTx();
    return true;
  }

  private findExistingNoteByMarker(parentItem: Zotero.Item, marker: string): Zotero.Item | null {
    const noteIDs = parentItem.getNotes() || [];
    for (const noteID of noteIDs) {
      const note = Zotero.Items.get(noteID);
      if (!note) continue;
      if (note.getNote().includes(`data-zrs-patent-detail="${marker}"`)) {
        return note;
      }
    }
    return null;
  }

  private async ensurePdfAttachment(
    parentItem: Zotero.Item,
    pdfUrl: string,
  ): Promise<{ ok: boolean; itemKey?: string; message?: string }> {
    const existing = findExistingAttachmentByUrl(parentItem, pdfUrl);
    if (existing) {
      return {
        ok: true,
        itemKey: existing.key,
        message: "PDF already attached",
      };
    }

    try {
      const imported = await this.tryImportPdfFromUrl(parentItem, pdfUrl);
      if (imported?.id) {
        try {
          Zotero.Prefs.clear(
            "extensions.zotero.zotero-resource-search.debug.lastPatentPdfError",
            true,
          );
        } catch {
          /* ignore */
        }
        return {
          ok: true,
          itemKey: imported.key,
          message: "PDF imported from provider URL",
        };
      }

      const filename = this.buildPdfFilename(parentItem);
      const tempDir =
        typeof Zotero.Attachments.createTemporaryStorageDirectory === "function"
          ? await Zotero.Attachments.createTemporaryStorageDirectory()
          : null;
      if (!tempDir?.path) {
        throw new Error("Zotero temporary storage directory is unavailable");
      }

      const filePath = joinPaths(tempDir.path, filename);
      await this.downloadPatentPdf(parentItem, pdfUrl, filePath);

      const attachment = await this.createAttachmentFromDownloadedPdf(
        parentItem,
        pdfUrl,
        filename,
        filePath,
        tempDir.path,
      );

      if (!attachment?.id) {
        throw new Error("Patent PDF attachment was not created");
      }

      return {
        ok: true,
        itemKey: attachment.key,
        message: "PDF downloaded from provider detail",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Patent PDF attachment failed: ${message}`);
      try {
        Zotero.Prefs.set(
          "extensions.zotero.zotero-resource-search.debug.lastPatentPdfError",
          message,
          true,
        );
      } catch {
        /* ignore */
      }
      reportZoteroError(error);
      return {
        ok: false,
        message: `Patent PDF attachment failed: ${message}`,
      };
    }
  }

  private queuePdfAttachment(
    parentItem: Zotero.Item,
    pdfUrl: string,
  ): { ok: boolean; itemKey?: string; message?: string } {
    const existing = findExistingAttachmentByUrl(parentItem, pdfUrl);
    if (existing) {
      return {
        ok: true,
        itemKey: existing.key,
        message: "PDF already attached",
      };
    }

    this.pdfQueue = this.pdfQueue
      .then(() => this.delay(1000))
      .then(async () => {
        await this.ensurePdfAttachment(parentItem, pdfUrl);
      })
      .catch((error) => {
        logger.error(`Queued patent PDF attachment failed: ${error}`);
        reportZoteroError(error);
      });

    return {
      ok: true,
      message: "PDF attachment queued",
    };
  }

  private buildPdfFilename(parentItem: Zotero.Item): string {
    const suggested =
      typeof Zotero.Attachments.getFileBaseNameFromItem === "function"
        ? Zotero.Attachments.getFileBaseNameFromItem(parentItem)
        : "";
    const fallback =
      suggested?.trim() ||
      parentItem.getField("patentNumber") ||
      parentItem.getField("applicationNumber") ||
      parentItem.key ||
      "patent-detail";
    const sanitized = fallback
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${parentItem.key}-${sanitized || "patent-detail"}.pdf`;
  }

  private async createAttachmentFromDownloadedPdf(
    parentItem: Zotero.Item,
    pdfUrl: string,
    filename: string,
    filePath: string,
    tempDirPath: string,
  ): Promise<Zotero.Item> {
    const errors: string[] = [];

    if (
      typeof Zotero.Attachments.createURLAttachmentFromTemporaryStorageDirectory === "function"
    ) {
      try {
        const attachment = await Zotero.Attachments.createURLAttachmentFromTemporaryStorageDirectory(
          {
            directory: tempDirPath,
            libraryID: parentItem.libraryID,
            filename,
            url: pdfUrl,
            parentItemID: parentItem.id,
            title: "全文 PDF",
            contentType: "application/pdf",
          },
        );
        if (attachment?.id) {
          return attachment;
        }
        errors.push("createURLAttachmentFromTemporaryStorageDirectory returned no attachment");
      } catch (error) {
        errors.push(
          `createURLAttachmentFromTemporaryStorageDirectory: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    try {
      const attachment = await Zotero.Attachments.importFromFile({
        file: createLocalFile(filePath),
        libraryID: parentItem.libraryID,
        parentItemID: parentItem.id,
        title: "全文 PDF",
        contentType: "application/pdf",
      });
      if (attachment?.id) {
        try {
          Zotero.Prefs.clear(
            "extensions.zotero.zotero-resource-search.debug.lastPatentPdfError",
            true,
          );
        } catch {
          /* ignore */
        }
        return attachment;
      }
      errors.push("importFromFile returned no attachment");
    } catch (error) {
      errors.push(`importFromFile: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const attachment = await Zotero.Attachments.linkFromFile({
        file: createLocalFile(filePath),
        parentItemID: parentItem.id,
        title: "全文 PDF",
        contentType: "application/pdf",
      });
      if (attachment?.id) {
        try {
          attachment.setField("url", pdfUrl);
          await attachment.saveTx();
        } catch {
          /* linked attachment may reject url field; note already stores the link */
        }
        return attachment;
      }
      errors.push("linkFromFile returned no attachment");
    } catch (error) {
      errors.push(`linkFromFile: ${error instanceof Error ? error.message : String(error)}`);
    }

    throw new Error(errors.join(" | ") || `PDF attachment creation failed for ${tempDirPath}`);
  }

  private async downloadPatentPdf(
    parentItem: Zotero.Item,
    pdfUrl: string,
    filePath: string,
  ): Promise<void> {
    const cookieHeader = buildPatentCookieHeader(pdfUrl);
    const xhr = await Zotero.HTTP.request("GET", pdfUrl, {
      headers: {
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
        ...(parentItem.getField("url")
          ? {
              Referer: parentItem.getField("url"),
            }
          : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cookieSandbox: createPatentCookieSandbox(pdfUrl),
      responseType: "arraybuffer",
      timeout: 60_000,
    });

    const data =
      xhr.response instanceof ArrayBuffer
        ? new Uint8Array(xhr.response)
        : new Uint8Array(
            typeof xhr.response === "string"
              ? Array.from(xhr.response, (char) => char.charCodeAt(0) & 0xff)
              : [],
          );

    if (data.length < 5) {
      throw new Error("Patent PDF response is empty");
    }

    const signature = String.fromCharCode(...Array.from(data.slice(0, 5)));
    if (signature !== "%PDF-") {
      throw new Error(`Patent PDF response is not a PDF (${signature})`);
    }

    await writeBinaryFile(filePath, data);
  }

  private async tryImportPdfFromUrl(
    parentItem: Zotero.Item,
    pdfUrl: string,
  ): Promise<Zotero.Item | null> {
    try {
      return await Zotero.Attachments.importFromURL({
        libraryID: parentItem.libraryID,
        parentItemID: parentItem.id,
        url: pdfUrl,
        title: "全文 PDF",
        fileBaseName: this.buildPdfFilename(parentItem).replace(/\.pdf$/i, ""),
        contentType: "application/pdf",
        referrer: parentItem.getField("url") || undefined,
        cookieSandbox: createPatentCookieSandbox(pdfUrl),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Patent PDF importFromURL failed: ${message}`);
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

}

export const patentDetailBridge = new PatentDetailBridge();
export { buildLookupKeys, buildTextHtml, buildSummaryNoteHtml };
