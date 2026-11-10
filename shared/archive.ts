import type { Category, Event } from "./types.js";

export interface ArchiveCriteria {
  policyVersion: string;
  policyFingerprint: string;
  accepted: true;
  categoryAtEntry: Category;
  topicHints: string[];
  locationAtEntry: Event["location"];
}
export interface ArchiveVersion {
  sequence: number;
  archivedAt: string;
  sourceFetchedAt: string;
  acquisition: "feed-snapshot" | "last-good-cache";
  contentHash: string;
  event: Event;
  criteria: ArchiveCriteria;
}
export interface ArchivedArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  firstArchivedAt: string;
  firstObservedAt: string;
  lastObservedAt: string;
  revisionCount: number;
  initial: ArchiveVersion;
}
export interface ArchivePage {
  items: ArchivedArticle[];
  total: number;
  limit: number;
  offset: number;
}
export interface ArchiveHealth {
  status: "ok" | "error";
  articles: number;
  revisions: number;
  message?: string;
}
