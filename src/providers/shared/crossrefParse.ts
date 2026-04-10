import type { ResourceItem } from "../../models/types";

const CROSSREF_TYPE_MAP: Record<string, string> = {
  "journal-article": "journalArticle",
  "proceedings-article": "conferencePaper",
  "book-chapter": "bookSection",
  book: "book",
  "posted-content": "preprint",
  "report-component": "report",
  report: "report",
  dissertation: "thesis",
  dataset: "document",
  monograph: "book",
};

export function parseCrossrefItem(data: any): ResourceItem | null {
  try {
    const doi: string = data.DOI ?? "";
    const titleList: string[] = data.title ?? [];
    const title = titleList[0] ?? "No title";

    const creators: ResourceItem["creators"] = [];
    for (const author of data.author ?? []) {
      const family = author.family ?? "";
      const given = author.given ?? "";
      if (family || given) {
        creators.push({
          firstName: given || undefined,
          lastName: family || given,
          creatorType: "author",
        });
      }
    }

    let abstractNote = data.abstract ?? "";
    if (abstractNote) {
      abstractNote = abstractNote.replace(/<[^>]+>/g, "");
    }

    let date: string | undefined;
    const dateData =
      data["published-print"] ?? data["published-online"] ?? data["published"] ?? data["created"];
    if (dateData?.["date-parts"]?.[0]) {
      const parts: number[] = dateData["date-parts"][0];
      if (parts[0]) {
        const y = parts[0];
        const m = String(parts[1] ?? 1).padStart(2, "0");
        const d = String(parts[2] ?? 1).padStart(2, "0");
        date = `${y}-${m}-${d}`;
      }
    }

    const itemType = CROSSREF_TYPE_MAP[data.type ?? ""] ?? "journalArticle";

    const citationCount: number = data["is-referenced-by-count"] ?? 0;

    const issn: string[] = data.ISSN ?? [];

    const extraParts: string[] = [];
    if (data.publisher) {
      extraParts.push(`Publisher: ${data.publisher}`);
    }
    if (citationCount > 0) {
      extraParts.push(`Citations: ${citationCount}`);
    }
    if (data.subject?.length) {
      extraParts.push(`Subjects: ${data.subject.join("; ")}`);
    }

    return {
      itemType,
      title,
      creators,
      abstractNote: abstractNote || undefined,
      date,
      DOI: doi || undefined,
      url: data.URL ?? (doi ? `https://doi.org/${doi}` : undefined),
      publicationTitle: data["container-title"]?.[0] ?? undefined,
      volume: data.volume ?? undefined,
      issue: data.issue ?? undefined,
      pages: data.page ?? undefined,
      ISSN: issn[0] ?? undefined,
      extra: extraParts.length > 0 ? extraParts.join("\n") : undefined,
      source: "crossref",
      citationCount,
    };
  } catch {
    return null;
  }
}
