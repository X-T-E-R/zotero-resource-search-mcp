import type { Creator, ResourceItem } from "../models/types";

export interface PatentFieldMap {
  itemType: "patent";
  fields: Record<string, string>;
  creators?: Creator[];
}

function setIfPresent(target: Record<string, string>, key: string, value?: string): void {
  const trimmed = value?.trim();
  if (trimmed) {
    target[key] = trimmed;
  }
}

export function getPatentFieldMap(resource: ResourceItem): PatentFieldMap {
  const fields: Record<string, string> = {};
  setIfPresent(fields, "title", resource.title);
  setIfPresent(fields, "abstractNote", resource.abstractNote);
  setIfPresent(fields, "url", resource.url);
  setIfPresent(fields, "country", resource.country);
  setIfPresent(fields, "assignee", resource.assignee);
  setIfPresent(fields, "issuingAuthority", resource.issuingAuthority);
  setIfPresent(fields, "patentNumber", resource.patentNumber);
  setIfPresent(fields, "applicationNumber", resource.applicationNumber);
  setIfPresent(fields, "priorityNumbers", resource.priorityNumbers);
  setIfPresent(fields, "filingDate", resource.filingDate);
  setIfPresent(fields, "issueDate", resource.issueDate);
  setIfPresent(fields, "legalStatus", resource.legalStatus);
  setIfPresent(fields, "references", resource.references);
  setIfPresent(fields, "extra", resource.extra);

  return {
    itemType: "patent",
    fields,
    creators: resource.creators?.map((creator) => ({
      firstName: creator.firstName,
      lastName: creator.lastName,
      creatorType: creator.creatorType || "inventor",
    })),
  };
}
