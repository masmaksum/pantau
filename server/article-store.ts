import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  ArticleCapture,
  CaptureJob,
  PreservedArticle,
} from "../shared/archive.js";

export const bytesHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export interface StoredAsset {
  hash: string;
  mime: string;
  data: Uint8Array;
}
export interface PendingCapture {
  articleId: string;
  revision: number;
  sourceId: string;
  url: string;
  attempts: number;
}

export class ArticleStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS capture_jobs (
        article_id TEXT NOT NULL, revision INTEGER NOT NULL, source_id TEXT NOT NULL, url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL, message TEXT,
        PRIMARY KEY(article_id,revision), FOREIGN KEY(article_id,revision) REFERENCES revisions(article_id,sequence)
      );
      CREATE INDEX IF NOT EXISTS capture_due ON capture_jobs(status,next_attempt_at);
      CREATE TABLE IF NOT EXISTS capture_assets (hash TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS article_captures (
        id TEXT PRIMARY KEY, article_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL,
        FOREIGN KEY(article_id,revision) REFERENCES revisions(article_id,sequence)
      );
      CREATE INDEX IF NOT EXISTS captures_article ON article_captures(article_id,revision);
      CREATE TABLE IF NOT EXISTS capture_asset_refs (
        capture_id TEXT NOT NULL REFERENCES article_captures(id), hash TEXT NOT NULL REFERENCES capture_assets(hash),
        PRIMARY KEY(capture_id,hash)
      );
      INSERT OR IGNORE INTO archive_meta VALUES ('content_schema_version','1');
      INSERT OR IGNORE INTO capture_jobs (article_id,revision,source_id,url,next_attempt_at)
        SELECT r.article_id,r.sequence,a.source_id,json_extract(r.payload,'$.event.url'),a.first_archived_at
        FROM revisions r JOIN articles a ON a.id=r.article_id;
      UPDATE capture_jobs SET status='retry',message='Dilanjutkan setelah restart' WHERE status='running';
    `);
  }
  enqueue(
    articleId: string,
    revision: number,
    sourceId: string,
    url: string,
    at: string,
  ) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO capture_jobs (article_id,revision,source_id,url,next_attempt_at) VALUES (?,?,?,?,?)`,
      )
      .run(articleId, revision, sourceId, url, at);
  }
  claim(now = new Date().toISOString()): PendingCapture | null {
    const row = this.db
      .prepare(
        `SELECT * FROM capture_jobs WHERE status IN ('queued','retry') AND next_attempt_at<=? ORDER BY next_attempt_at,article_id,revision LIMIT 1`,
      )
      .get(now);
    if (!row) return null;
    this.db
      .prepare(
        `UPDATE capture_jobs SET status='running',attempts=attempts+1,message=NULL WHERE article_id=? AND revision=?`,
      )
      .run(row.article_id!, row.revision!);
    return {
      articleId: String(row.article_id),
      revision: Number(row.revision),
      sourceId: String(row.source_id),
      url: String(row.url),
      attempts: Number(row.attempts) + 1,
    };
  }
  finish(
    job: PendingCapture,
    capture: Omit<
      ArticleCapture,
      "id" | "articleId" | "revision" | "contentHash"
    >,
    assets: StoredAsset[],
    retryAt?: string,
  ) {
    const result: ArticleCapture = {
      ...capture,
      id: randomUUID(),
      articleId: job.articleId,
      revision: job.revision,
      contentHash: bytesHash(JSON.stringify(capture)),
    };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const a of assets) {
        if (bytesHash(a.data) !== a.hash)
          throw new Error("Asset hash mismatch");
        this.db
          .prepare("INSERT OR IGNORE INTO capture_assets VALUES (?,?,?)")
          .run(a.hash, a.mime, a.data);
      }
      this.db
        .prepare("INSERT INTO article_captures VALUES (?,?,?,?)")
        .run(result.id, job.articleId, job.revision, JSON.stringify(result));
      const refs = new Set([
        ...result.pages.map((p) => p.htmlHash),
        ...result.photos.flatMap((p) => (p.assetHash ? [p.assetHash] : [])),
      ]);
      for (const h of refs)
        this.db
          .prepare("INSERT INTO capture_asset_refs VALUES (?,?)")
          .run(result.id, h);
      const retry = result.status === "partial" && job.attempts < 3;
      this.setState(
        job,
        retry ? "retry" : result.status,
        result.warnings.join("; ") || null,
        retryAt,
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return result;
  }
  fail(
    job: PendingCapture,
    message: string,
    permanent = false,
    retryAt?: string,
  ) {
    const hasSnapshot = !!this.db
      .prepare(
        "SELECT 1 FROM article_captures WHERE article_id=? AND revision=? LIMIT 1",
      )
      .get(job.articleId, job.revision);
    this.setState(
      job,
      permanent || job.attempts >= 3
        ? hasSnapshot
          ? "partial"
          : "unavailable"
        : "retry",
      message,
      retryAt,
    );
  }
  private setState(
    job: PendingCapture,
    status: CaptureJob["status"],
    message: string | null,
    retryAt?: string,
  ) {
    const next = new Date(
      Math.max(
        Date.now() + (job.attempts === 1 ? 300_000 : 1_800_000),
        retryAt ? Date.parse(retryAt) : 0,
      ),
    ).toISOString();
    this.db
      .prepare(
        `UPDATE capture_jobs SET status=?,next_attempt_at=?,message=? WHERE article_id=? AND revision=?`,
      )
      .run(status, next, message, job.articleId, job.revision);
  }
  detail(articleId: string): PreservedArticle {
    return {
      jobs: this.db
        .prepare(
          "SELECT * FROM capture_jobs WHERE article_id=? ORDER BY revision",
        )
        .all(articleId)
        .map((r) => ({
          articleId,
          revision: Number(r.revision),
          status: String(r.status) as CaptureJob["status"],
          attempts: Number(r.attempts),
          nextAttemptAt: String(r.next_attempt_at),
          message: r.message === null ? null : String(r.message),
        })),
      captures: this.db
        .prepare(
          "SELECT payload FROM article_captures WHERE article_id=? ORDER BY revision,rowid",
        )
        .all(articleId)
        .map((r) => JSON.parse(String(r.payload))),
    };
  }
  asset(
    articleId: string,
    captureId: string,
    hash: string,
  ): StoredAsset | null {
    const row = this.db
      .prepare(
        `SELECT a.* FROM capture_assets a JOIN capture_asset_refs r ON r.hash=a.hash JOIN article_captures c ON c.id=r.capture_id WHERE c.article_id=? AND c.id=? AND a.hash=?`,
      )
      .get(articleId, captureId, hash);
    return row
      ? { hash, mime: String(row.mime), data: row.data as Uint8Array }
      : null;
  }
  stats(): Record<string, number> {
    return Object.fromEntries(
      this.db
        .prepare(
          "SELECT status,COUNT(*) AS n FROM capture_jobs GROUP BY status",
        )
        .all()
        .map((r) => [String(r.status), Number(r.n)]),
    );
  }
}
