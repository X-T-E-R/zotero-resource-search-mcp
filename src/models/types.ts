export interface Creator {
  firstName?: string;
  lastName: string;
  creatorType: string;
}

export interface Tag {
  tag: string;
  type?: number;
}

export interface ResourceItem {
  itemType: string;
  title: string;
  creators?: Creator[];
  date?: string;
  DOI?: string;
  url?: string;
  abstractNote?: string;
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  ISSN?: string;
  ISBN?: string;
  language?: string;
  accessDate?: string;
  rights?: string;
  extra?: string;
  tags?: Tag[];

  source?: string;
  relevanceScore?: number;
  citationCount?: number;
}

export interface SearchOptions {
  maxResults?: number;
  page?: number;
  year?: string;
  author?: string;
  sortBy?: "relevance" | "date" | "citations";
  extra?: Record<string, any>;
}

export interface SearchResult {
  platform: string;
  query: string;
  totalResults: number;
  items: ResourceItem[];
  page: number;
  elapsed?: number;
  hasMore?: boolean;
  error?: string;
}

export type SourceType = "web" | "academic" | "patent";

export interface SearchProvider {
  readonly name: string;
  readonly id: string;
  readonly sourceType: SourceType;
  isAvailable(): boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
}

export interface MetadataResolver {
  readonly name: string;
  readonly supportedIdentifiers: string[];
  resolve(identifier: string, type?: string): Promise<ResourceItem | null>;
}
