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
  preservation?: Record<string, number>;
}

export interface PreservedPhoto {
  sourceUrl: string;
  caption: string | null;
  alt: string | null;
  assetHash: string | null;
  mime?: string;
  bytes?: number;
  error?: string;
}
export interface PreservedPage {
  url: string;
  fetchedAt: string;
  htmlHash: string;
}
export interface ArticleCapture {
  id: string;
  articleId: string;
  revision: number;
  capturedAt: string;
  extractor: string;
  title: string;
  byline: string | null;
  text: string;
  pages: PreservedPage[];
  photos: PreservedPhoto[];
  warnings: string[];
  contentHash: string;
  status: "complete" | "partial";
}
export interface CaptureJob {
  articleId: string;
  revision: number;
  status:
    | "queued"
    | "running"
    | "retry"
    | "complete"
    | "partial"
    | "unavailable";
  attempts: number;
  nextAttemptAt: string;
  message: string | null;
}
export interface PreservedArticle {
  jobs: CaptureJob[];
  captures: ArticleCapture[];
}
