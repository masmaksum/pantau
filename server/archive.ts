import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Event } from "../shared/types.js";
import type {
  ArchiveCriteria,
  ArchivePage,
  ArchivedArticle,
  ArchiveVersion,
  PreservedArticle,
} from "../shared/archive.js";
import { applyTopicPolicy, isAllowedReport } from "../shared/topic-policy.js";
import { canonicalUrl, idFor } from "./domain.js";
import { ArticleStore } from "./article-store.js";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export interface PolicySnapshot {
  version: string;
  fingerprint: string;
  files: Record<string, string>;
}
export function currentPolicySnapshot(): PolicySnapshot {
  const files = Object.fromEntries(
    [
      "../shared/topic-policy.ts",
      "../shared/human-rights.ts",
      "./domain.ts",
    ].map((path) => [
      path,
      readFileSync(new URL(path, import.meta.url), "utf8"),
    ]),
  );
  const version = "ham-priority-and-gazetteer-v1";
  return { version, fingerprint: hash({ version, files }), files };
}
export interface ArchiveFilter {
  q?: string;
  source?: string;
  category?: string;
  location?: string;
  located?: "yes" | "no";
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}
interface FeedIntake {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  acquisition: ArchiveVersion["acquisition"];
}

export class NewsArchive {
  readonly database: DatabaseSync;
  readonly content: ArticleStore;
  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS archive_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO archive_meta VALUES ('schema_version','1');
      CREATE TABLE IF NOT EXISTS policies (fingerprint TEXT PRIMARY KEY, version TEXT NOT NULL, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_name TEXT NOT NULL, source_url TEXT NOT NULL,
        canonical_url TEXT NOT NULL, first_archived_at TEXT NOT NULL, first_observed_at TEXT NOT NULL,
        last_observed_at TEXT NOT NULL, initial_category TEXT NOT NULL, initial_location TEXT,
        initial_title TEXT NOT NULL, initial_summary TEXT NOT NULL,
        initial_json TEXT NOT NULL, latest_hash TEXT NOT NULL, revision_count INTEGER NOT NULL,
        UNIQUE(source_id,canonical_url)
      );
      CREATE TABLE IF NOT EXISTS revisions (
        article_id TEXT NOT NULL REFERENCES articles(id), sequence INTEGER NOT NULL,
        payload TEXT NOT NULL, PRIMARY KEY(article_id,sequence)
      );
      CREATE TABLE IF NOT EXISTS intake_runs (
        source_id TEXT NOT NULL, fetched_at TEXT NOT NULL, archived_at TEXT NOT NULL,
        PRIMARY KEY(source_id,fetched_at)
      );
      CREATE INDEX IF NOT EXISTS article_date ON articles(first_archived_at);
      CREATE INDEX IF NOT EXISTS article_source ON articles(source_id,first_archived_at);
      CREATE INDEX IF NOT EXISTS article_category ON articles(initial_category,first_archived_at);
      CREATE INDEX IF NOT EXISTS article_location ON articles(initial_location);
    `);
    const schema = this.database
      .prepare("SELECT value FROM archive_meta WHERE key='schema_version'")
      .get();
    if (schema?.value !== "1") {
      this.database.close();
      throw new Error("Unsupported archive schema version");
    }
    this.content = new ArticleStore(this.database);
  }

  preserveBatch(
    intake: FeedIntake,
    input: Event[],
    policy: PolicySnapshot,
  ): { inserted: number; revised: number } {
    if (!Number.isFinite(Date.parse(intake.fetchedAt)))
      throw new Error("Invalid upstream snapshot time");
    const db = this.database;
    const archivedAt = new Date().toISOString();
    let inserted = 0,
      revised = 0;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (
        db
          .prepare(
            "SELECT 1 FROM intake_runs WHERE source_id=? AND fetched_at=?",
          )
          .get(intake.sourceId, intake.fetchedAt)
      ) {
        db.exec("COMMIT");
        return { inserted, revised };
      }
      db.prepare("INSERT OR IGNORE INTO policies VALUES (?,?,?)").run(
        policy.fingerprint,
        policy.version,
        JSON.stringify(policy),
      );
      for (const raw of input) {
        const event = applyTopicPolicy(raw);
        if (!isAllowedReport(event)) continue;
        const url = canonicalUrl(event.url);
        const id = idFor(`archive:${intake.sourceId}:${url}`);
        const criteria: ArchiveCriteria = {
          policyVersion: policy.version,
          policyFingerprint: policy.fingerprint,
          accepted: true,
          categoryAtEntry: event.category,
          topicHints: event.topicHints ?? [],
          locationAtEntry: event.location,
        };
        // Fetch timestamps do not create new content revisions; changed content, location or rules do.
        const { observedAt: _observedAt, ...content } = event;
        const contentHash = hash({ content: { ...content, url }, criteria });
        const previous = db
          .prepare("SELECT latest_hash,revision_count FROM articles WHERE id=?")
          .get(id);
        const sequence = previous
          ? Number(previous.revision_count) +
            (previous.latest_hash === contentHash ? 0 : 1)
          : 1;
        const version: ArchiveVersion = {
          sequence,
          archivedAt,
          sourceFetchedAt: intake.fetchedAt,
          acquisition: intake.acquisition,
          contentHash,
          event,
          criteria,
        };
        if (!previous) {
          db.prepare(
            `INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).run(
            id,
            intake.sourceId,
            intake.sourceName,
            intake.sourceUrl,
            url,
            archivedAt,
            event.observedAt,
            intake.fetchedAt,
            event.category,
            event.location?.name ?? null,
            event.title,
            event.summary,
            JSON.stringify(version),
            contentHash,
            1,
          );
          inserted++;
        } else {
          db.prepare(
            "UPDATE articles SET last_observed_at=MAX(last_observed_at,?), latest_hash=?,revision_count=? WHERE id=?",
          ).run(intake.fetchedAt, contentHash, sequence, id);
        }
        if (!previous || previous.latest_hash !== contentHash) {
          db.prepare("INSERT INTO revisions VALUES (?,?,?)").run(
            id,
            sequence,
            JSON.stringify(version),
          );
          this.content.enqueue(
            id,
            sequence,
            intake.sourceId,
            event.url,
            archivedAt,
          );
          if (previous) revised++;
        }
      }
      db.prepare("INSERT INTO intake_runs VALUES (?,?,?)").run(
        intake.sourceId,
        intake.fetchedAt,
        archivedAt,
      );
      db.exec("COMMIT");
      return { inserted, revised };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  private record(row: Record<string, any>): ArchivedArticle {
    return {
      id: row.id,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      canonicalUrl: row.canonical_url,
      firstArchivedAt: row.first_archived_at,
      firstObservedAt: row.first_observed_at,
      lastObservedAt: row.last_observed_at,
      revisionCount: row.revision_count,
      initial: JSON.parse(row.initial_json),
    };
  }
  list(filter: ArchiveFilter): ArchivePage {
    const clauses: string[] = [],
      values: string[] = [];
    const add = (sql: string, ...params: string[]) => {
      clauses.push(sql);
      values.push(...params);
    };
    const literal = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
    if (filter.q)
      add(
        "(initial_title LIKE ? ESCAPE '\\' OR initial_summary LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM article_captures c WHERE c.article_id=articles.id AND json_extract(c.payload,'$.text') LIKE ? ESCAPE '\\'))",
        literal(filter.q),
        literal(filter.q),
        literal(filter.q),
      );
    if (filter.source) add("source_id=?", filter.source);
    if (filter.category) add("initial_category=?", filter.category);
    if (filter.location)
      add("initial_location LIKE ? ESCAPE '\\'", literal(filter.location));
    if (filter.located === "yes") add("initial_location IS NOT NULL");
    if (filter.located === "no") add("initial_location IS NULL");
    if (filter.from) add("first_archived_at>=?", filter.from);
    if (filter.to) add("first_archived_at<?", filter.to);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(
      this.database
        .prepare(`SELECT COUNT(*) AS n FROM articles ${where}`)
        .get(...values)?.n ?? 0,
    );
    const rows = this.database
      .prepare(
        `SELECT * FROM articles ${where} ORDER BY first_archived_at DESC,id ASC LIMIT ? OFFSET ?`,
      )
      .all(...values, filter.limit, filter.offset);
    return {
      items: rows.map((row) => this.record(row)),
      total,
      limit: filter.limit,
      offset: filter.offset,
    };
  }
  detail(
    id: string,
  ):
    | (ArchivedArticle & {
        versions: ArchiveVersion[];
        preservation: PreservedArticle;
      })
    | null {
    const row = this.database
      .prepare("SELECT * FROM articles WHERE id=?")
      .get(id);
    if (!row) return null;
    return {
      ...this.record(row),
      preservation: this.content.detail(id),
      versions: this.database
        .prepare(
          "SELECT payload FROM revisions WHERE article_id=? ORDER BY sequence",
        )
        .all(id)
        .map((r) => JSON.parse(String(r.payload))),
    };
  }
  policy(fingerprint: string): PolicySnapshot | null {
    const row = this.database
      .prepare("SELECT snapshot FROM policies WHERE fingerprint=?")
      .get(fingerprint);
    return row ? JSON.parse(String(row.snapshot)) : null;
  }
  stats() {
    return {
      preservation: this.content.stats(),
      articles: Number(
        this.database.prepare("SELECT COUNT(*) AS n FROM articles").get()?.n ??
          0,
      ),
      revisions: Number(
        this.database.prepare("SELECT COUNT(*) AS n FROM revisions").get()?.n ??
          0,
      ),
      categories: this.database
        .prepare(
          "SELECT initial_category AS id,COUNT(*) AS count FROM articles GROUP BY initial_category ORDER BY initial_category",
        )
        .all(),
      sources: this.database
        .prepare(
          "SELECT source_id AS id,source_name AS name,COUNT(*) AS count FROM articles GROUP BY source_id,source_name ORDER BY source_name",
        )
        .all(),
    };
  }
  close() {
    this.database.close();
  }
}
