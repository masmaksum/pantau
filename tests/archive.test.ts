import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NewsArchive, currentPolicySnapshot } from "../server/archive.js";
import { archiveFilter } from "../server/archive-routes.js";
import { createApp } from "../server/app.js";
import type { Event } from "../shared/types.js";
import { SourceCache } from "../server/cache.js";
import { NewsPipeline } from "../server/news-pipeline.js";

const policy = currentPolicySnapshot();
const event = (changes: Partial<Event> = {}): Event => ({
  id: "e1",
  title: "Banjir di Semarang",
  summary: "Warga terdampak banjir",
  url: "https://news.example/1",
  source: "News",
  category: "banjir",
  location: {
    name: "Semarang",
    lat: -6.97,
    lon: 110.42,
    precision: "city",
    method: "headline-match",
  },
  publishedAt: "2020-01-01T00:00:00Z",
  observedAt: "2026-11-10T00:00:00Z",
  verification: "reported",
  ...changes,
});
const intake = (fetchedAt = "2026-11-10T00:01:00Z", sourceId = "antara") => ({
  sourceId,
  sourceName: sourceId,
  sourceUrl: "https://news.example/rss",
  fetchedAt,
  acquisition: "feed-snapshot" as const,
});
const filter = { limit: 25, offset: 0 };

test("archive write failures are visible and cached snapshots can be retried after recovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-archive-retry-"));
  const now = new Date().toISOString();
  await writeFile(
    join(dir, "antara.json"),
    JSON.stringify({ fetchedAt: now, value: [event()] }),
  );
  await writeFile(
    join(dir, "detik.json"),
    JSON.stringify({ fetchedAt: now, value: [] }),
  );
  class UnwritableArchive extends NewsArchive {
    fail = true;
    override preserveBatch(...args: Parameters<NewsArchive["preserveBatch"]>) {
      if (this.fail) throw new Error("Simulated disk write failure");
      return super.preserveBatch(...args);
    }
  }
  const store = new UnwritableArchive(":memory:");
  const pipeline = new NewsPipeline(new SourceCache(dir), store);
  try {
    const live = await pipeline.poll();
    assert.equal(live[0].events.length, 1);
    assert.equal(pipeline.health().status, "error");
    assert.equal(store.stats().articles, 0);
    store.fail = false;
    await pipeline.poll();
    assert.equal(pipeline.health().status, "ok");
    assert.equal(store.stats().articles, 1);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("persist original criteria, location, content and exact policy snapshot across restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-archive-"));
  const path = join(dir, "news.sqlite");
  let db = new NewsArchive(path);
  try {
    db.preserveBatch(intake(), [event()], policy);
    const original = db.list(filter).items[0];
    db.close();
    db = new NewsArchive(path);
    const saved = db.detail(original.id)!;
    assert.equal(saved.initial.event.title, "Banjir di Semarang");
    assert.equal(saved.initial.criteria.categoryAtEntry, "banjir");
    assert.equal(saved.initial.criteria.locationAtEntry?.precision, "city");
    assert.equal(saved.firstArchivedAt, original.firstArchivedAt);
    assert.equal(saved.initial.criteria.policyFingerprint, policy.fingerprint);
    assert.deepEqual(db.policy(policy.fingerprint)?.files, policy.files);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("repeated cache reads and timestamp-only changes do not create duplicate articles or revisions", () => {
  const db = new NewsArchive(":memory:");
  try {
    db.preserveBatch(intake(), [event()], policy);
    db.preserveBatch(intake(), [event()], policy);
    db.preserveBatch(
      intake("2026-11-10T00:03:00Z"),
      [event({ observedAt: "2026-11-10T00:02:59Z" })],
      policy,
    );
    assert.equal(db.stats().articles, 1);
    assert.equal(db.stats().revisions, 1);
    assert.equal(
      db.list(filter).items[0].lastObservedAt,
      "2026-11-10T00:03:00Z",
    );
  } finally {
    db.close();
  }
});

test("publisher changes create a new version without overwriting entry location or category", () => {
  const db = new NewsArchive(":memory:");
  try {
    db.preserveBatch(intake(), [event()], policy);
    db.preserveBatch(
      intake("2026-11-10T00:03:00Z"),
      [
        event({
          title: "Kebakaran di Bandung",
          summary: "Laporan diperbarui",
          category: "kebakaran",
          location: {
            name: "Bandung",
            lat: -6.91,
            lon: 107.61,
            precision: "city",
            method: "headline-match",
          },
        }),
      ],
      policy,
    );
    const saved = db.detail(db.list(filter).items[0].id)!;
    assert.equal(saved.revisionCount, 2);
    assert.equal(saved.initial.event.location?.name, "Semarang");
    assert.equal(saved.initial.criteria.categoryAtEntry, "banjir");
    assert.equal(saved.versions[1].event.location?.name, "Bandung");
    assert.equal(db.list({ ...filter, category: "banjir" }).total, 1);
    assert.equal(db.list({ ...filter, category: "kebakaran" }).total, 0);
  } finally {
    db.close();
  }
});

test("new policy fingerprints create a revision, and identical URLs in separate channels remain attributable", () => {
  const db = new NewsArchive(":memory:");
  try {
    db.preserveBatch(intake(), [event()], policy);
    db.preserveBatch(intake("2026-11-10T00:03:00Z"), [event()], {
      ...policy,
      version: "test-new-rule",
      fingerprint: "a".repeat(64),
    });
    db.preserveBatch(
      intake("2026-11-10T00:03:00Z", "detik"),
      [event()],
      policy,
    );
    assert.equal(db.stats().articles, 2);
    assert.equal(db.stats().revisions, 3);
    assert.equal(db.list({ ...filter, source: "detik" }).total, 1);
  } finally {
    db.close();
  }
});

test("exclude rejected topics but archive unknown locations and missing publication dates honestly", () => {
  const db = new NewsArchive(":memory:");
  try {
    db.preserveBatch(
      intake(),
      [
        event({ title: "IHSG menguat", summary: "", category: "lainnya" }),
        event({
          id: "u1",
          url: "https://news.example/unknown",
          location: null,
          publishedAt: null,
        }),
      ],
      policy,
    );
    const saved = db.list({ ...filter, located: "no" }).items;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].initial.event.publishedAt, null);
    assert.equal(saved[0].initial.criteria.locationAtEntry, null);
    assert.equal(db.list({ ...filter, located: "yes" }).total, 0);
  } finally {
    db.close();
  }
});

test("intake transaction rolls back entirely on failure and can be retried", () => {
  const db = new NewsArchive(":memory:");
  try {
    assert.throws(() =>
      db.preserveBatch(
        intake(),
        [event(), event({ url: "invalid-url" })],
        policy,
      ),
    );
    assert.equal(db.stats().articles, 0);
    db.preserveBatch(intake(), [event()], policy);
    assert.equal(db.stats().articles, 1);
  } finally {
    db.close();
  }
});

test("archive queries bind input, escape LIKE wildcards, and interpret date filters in WIB", () => {
  const db = new NewsArchive(":memory:");
  try {
    db.preserveBatch(intake(), [event()], policy);
    assert.equal(db.list({ ...filter, q: "' OR 1=1 --" }).total, 0);
    assert.equal(db.list({ ...filter, q: "%" }).total, 0);
    assert.equal(db.list({ ...filter, location: "Semarang" }).total, 1);
    const dates = archiveFilter({ from: "2026-11-10", to: "2026-11-10" });
    assert.equal(dates.from, "2026-11-09T17:00:00.000Z");
    assert.equal(dates.to, "2026-11-10T17:00:00.000Z");
    assert.throws(() => archiveFilter({ from: "2026-02-30" }));
    assert.throws(() => archiveFilter({ limit: "100000" }));
  } finally {
    db.close();
  }
});

test("backup CLI includes committed WAL data and refuses to overwrite backups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-archive-backup-"));
  const db = new NewsArchive(join(dir, "news.sqlite"));
  try {
    db.preserveBatch(intake(), [event()], policy);
    const target = join(dir, "backup.sqlite");
    const run = () =>
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "scripts/archive-backup.ts", target],
        {
          env: { ...process.env, ARCHIVE_PATH: db.path },
        },
      );
    await run();
    await assert.rejects(run, /EEXIST/);
    const copy = new NewsArchive(target);
    try {
      assert.equal(copy.stats().articles, 1);
      assert.equal(copy.stats().revisions, 1);
    } finally {
      copy.close();
    }
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("server-side news polling archives before the live time window and archive endpoints require authentication", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-archive-api-"));
  const now = new Date().toISOString();
  await writeFile(
    join(dir, "antara.json"),
    JSON.stringify({ fetchedAt: now, value: [event()] }),
  );
  for (const id of ["detik", "bmkg"])
    await writeFile(
      join(dir, `${id}.json`),
      JSON.stringify({ fetchedAt: now, value: [] }),
    );
  const app = createApp({
    archivePath: join(dir, "news.sqlite"),
    cacheDir: dir,
    apiToken: "test-token",
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // Same operation invoked at startup/interval, without opening /api/situation.
    await app.locals.pollNews();
    assert.equal((await fetch(`${base}/api/archive`)).status, 401);
    const headers = { Authorization: "Bearer test-token" };
    const page = await (
      await fetch(
        `${base}/api/archive?source=antara&category=banjir&location=Semarang`,
        { headers },
      )
    ).json();
    assert.equal(page.total, 1);
    const lookup = `${base}/api/archive/lookup?${new URLSearchParams({ source: "antara", url: "https://news.example/1?utm_source=lookup" })}`;
    assert.equal((await fetch(lookup)).status, 401);
    assert.deepEqual(await (await fetch(lookup, { headers })).json(), {
      id: page.items[0].id,
    });
    assert.equal(
      (
        await fetch(`${base}/api/archive/lookup?source=antara&url=invalid`, {
          headers,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(
          `${base}/api/archive/lookup?source=unknown&url=https://news.example/1`,
          { headers },
        )
      ).status,
      404,
    );
    const detail = await (
      await fetch(`${base}/api/archive/${page.items[0].id}`, { headers })
    ).json();
    assert.equal(detail.versions.length, 1);
    const p = await fetch(
      `${base}/api/archive/policies/${detail.initial.criteria.policyFingerprint}`,
      { headers },
    );
    assert.equal(p.status, 200);
    const live = await (
      await fetch(`${base}/api/situation?hours=6`, { headers })
    ).json();
    assert.deepEqual(live.events, []);
    assert.equal(live.archive.articles, 1);
    assert.equal(
      (await fetch(`${base}/api/archive?limit=1000`, { headers })).status,
      400,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.locals.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
