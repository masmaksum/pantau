import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { backup } from "node:sqlite";
import type { AddressInfo } from "node:net";
import { NewsArchive, currentPolicySnapshot } from "../server/archive.js";
import { ArticleWorker } from "../server/article-worker.js";
import {
  ArticleFetcher,
  allowedCaptureUrl,
  verifiedImageMime,
  CaptureError,
  type ArchiveTransport,
} from "../server/article-fetch.js";
import { extractArticle } from "../server/article-extract.js";
import { createApp } from "../server/app.js";
import type { Event } from "../shared/types.js";

const url = "https://www.antaranews.com/berita/123/banjir-di-bandung";
const photoUrl = "https://cdn.antaranews.com/foto.jpg";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNf8AAAAASUVORK5CYII=",
  "base64",
);
const text =
  "Warga Bandung menghadapi banjir dan membutuhkan bantuan. Petugas menyatakan pemeriksaan lokasi akan dilanjutkan untuk memastikan keselamatan seluruh warga terdampak.";
const html = `<div class="wrap__article-detail-title"><h1>Banjir di Bandung</h1></div><meta name="author" content="Reporter A"><div class="wrap__article-detail-image"><figure><img src="${photoUrl}" alt="Warga di lokasi"/><figcaption>Keterangan asli. Foto: Redaksi &amp; Kontributor.</figcaption></figure></div><div class="post-content"><p>${text}</p><script>alert('x')</script><aside>Iklan terlarang</aside><p>Ini kata pencarian arsippanjangunik.</p><p class="baca-juga">Baca juga: promosi lain</p></div>`;
const fixtureEvent: Event = {
  id: "fixture",
  title: "Banjir di Bandung",
  summary: "Warga terdampak",
  url,
  source: "ANTARA",
  category: "banjir",
  location: {
    name: "Bandung",
    lat: -6.91,
    lon: 107.61,
    precision: "city",
    method: "headline-match",
  },
  publishedAt: "2026-11-10T00:00:00Z",
  observedAt: new Date().toISOString(),
  verification: "reported",
};
function seed(db: NewsArchive) {
  db.preserveBatch(
    {
      sourceId: "antara",
      sourceName: "ANTARA",
      sourceUrl: "https://www.antaranews.com/rss/terkini.xml",
      fetchedAt: new Date().toISOString(),
      acquisition: "feed-snapshot",
    },
    [fixtureEvent],
    currentPolicySnapshot(),
  );
  return db.list({ limit: 1, offset: 0 }).items[0].id;
}
const resource = async (
  _source: string,
  u: string,
  kind: "image" | "page",
) => ({
  url: u,
  bytes: kind === "page" ? Buffer.from(html) : png,
  mime: kind === "page" ? "text/html" : "image/png",
  fetchedAt: new Date().toISOString(),
});

test("publisher extraction preserves body, lazy photos, captions, alt and credits without scripts/ads", () => {
  const a = extractArticle(html, url, "antara");
  assert.ok(a.text.includes(text));
  assert.ok(!a.text.includes("alert"));
  assert.ok(!a.text.includes("Iklan"));
  assert.ok(!a.text.includes("promosi"));
  assert.equal(
    a.photos[0].caption,
    "Keterangan asli. Foto: Redaksi & Kontributor.",
  );
  assert.equal(a.photos[0].alt, "Warga di lokasi");
  const d = extractArticle(
    `<h1 class="detail__title">Judul detik</h1><div class="detail__author">Reporter D</div><div class="detail__media"><figure><img src="placeholder.gif" data-src="https://awsimages.detik.net.id/gambar.jpeg"/><figcaption>Caption D</figcaption></figure></div><div class="detail__body-text"><p>${text}</p><img srcset="small.jpg 300w, large.jpg 1200w"/></div>`,
    "https://news.detik.com/berita/d-123/judul",
    "detik",
  );
  assert.equal(d.byline, "Reporter D");
  assert.equal(
    d.photos[0].sourceUrl,
    "https://awsimages.detik.net.id/gambar.jpeg",
  );
  assert.equal(
    d.photos[1].sourceUrl,
    "https://news.detik.com/berita/d-123/large.jpg",
  );
  assert.equal(d.photos[1].caption, null);
  const inline = extractArticle(
    `<div class="detail__body-text"><p>${text}</p><div class="pic_artikel_sisip"><div class="pic"><img src="https://awsimages.detik.net.id/inline.jpeg" alt="Alt berbeda"/><span>Caption foto sisipan (Foto: Redaksi)</span></div></div><button><img src="https://awscdn.detik.net.id/assets2/images/loading.gif" alt="Loading..."/></button></div>`,
    "https://news.detik.com/berita/d-123/judul",
    "detik",
  );
  assert.equal(inline.photos.length, 1);
  assert.equal(
    inline.photos[0].caption,
    "Caption foto sisipan (Foto: Redaksi)",
  );
  assert.ok(!inline.text.includes("Caption foto sisipan"));
  assert.throws(
    () =>
      extractArticle(
        '<script type="application/ld+json">{"isAccessibleForFree":false}</script>' +
          html,
        url,
        "antara",
      ),
    /membatasi akses/,
  );
});

test("capture persists text, raw HTML, actual photo bytes and captions across restart and backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-full-"));
  const path = join(dir, "news.sqlite");
  let db = new NewsArchive(path);
  try {
    const id = seed(db),
      worker = new ArticleWorker(db, { get: resource });
    await worker.tick();
    await worker.stop();
    const first = db.detail(id)!.preservation.captures[0];
    assert.equal(first.status, "complete");
    assert.ok(first.text.includes(text));
    assert.equal(
      first.photos[0].caption,
      "Keterangan asli. Foto: Redaksi & Kontributor.",
    );
    assert.deepEqual(
      Buffer.from(
        db.content.asset(id, first.id, first.photos[0].assetHash!)!.data,
      ),
      png,
    );
    assert.equal(
      Buffer.from(
        db.content.asset(id, first.id, first.pages[0].htmlHash)!.data,
      ).toString(),
      html,
    );
    assert.equal(
      db.list({ q: "arsippanjangunik", limit: 25, offset: 0 }).total,
      1,
    );
    await backup(db.database, join(dir, "backup.sqlite"));
    db.close();
    db = new NewsArchive(path);
    assert.deepEqual(db.detail(id)!.preservation.captures[0], first);
    const restored = new NewsArchive(join(dir, "backup.sqlite"));
    try {
      assert.deepEqual(
        Buffer.from(
          restored.content.asset(id, first.id, first.photos[0].assetHash!)!
            .data,
        ),
        png,
      );
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("queued old archive records are backfilled and interrupted jobs survive restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-migrate-"));
  const path = join(dir, "news.sqlite");
  let db = new NewsArchive(path);
  try {
    const id = seed(db);
    db.database.exec("DELETE FROM capture_jobs");
    db.close();
    db = new NewsArchive(path);
    assert.equal(db.detail(id)!.preservation.jobs[0].status, "queued");
    assert.ok(db.content.claim());
    db.close();
    db = new NewsArchive(path);
    const job = db.detail(id)!.preservation.jobs[0];
    assert.equal(job.status, "retry");
    assert.equal(job.attempts, 1);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed photos preserve text/caption with partial status and later retries append without overwriting", async () => {
  const db = new NewsArchive(":memory:");
  try {
    const id = seed(db);
    const worker = new ArticleWorker(db, {
      get: async (s, u, k) => {
        if (k === "image") throw new CaptureError("HTTP 503");
        return resource(s, u, k);
      },
    });
    await worker.tick();
    const initial = db.detail(id)!.preservation.captures[0];
    assert.equal(initial.status, "partial");
    assert.ok(initial.text);
    assert.equal(initial.photos[0].assetHash, null);
    assert.ok(initial.photos[0].caption);
    assert.equal(db.content.stats().retry, 1);
    db.database.exec(
      "UPDATE capture_jobs SET next_attempt_at='2000-01-01T00:00:00Z'",
    );
    await new ArticleWorker(db, { get: resource }).tick();
    const saved = db.detail(id)!;
    assert.equal(saved.preservation.captures.length, 2);
    assert.deepEqual(saved.preservation.captures[0], initial);
    assert.equal(saved.preservation.captures[1].status, "complete");
    assert.equal(saved.initial.criteria.locationAtEntry?.name, "Bandung");
  } finally {
    db.close();
  }
});

test("blocked pages are unavailable, temporary failures retry and workers coalesce", async () => {
  const db = new NewsArchive(":memory:");
  try {
    const id = seed(db);
    let calls = 0;
    const worker = new ArticleWorker(db, {
      get: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 10));
        throw new CaptureError("HTTP 403", true);
      },
    });
    await Promise.all([worker.tick(), worker.tick()]);
    assert.equal(calls, 1);
    assert.equal(db.detail(id)!.preservation.jobs[0].status, "unavailable");
    assert.equal(db.detail(id)!.preservation.captures.length, 0);
  } finally {
    db.close();
  }
});

test("a failed later attempt never hides an earlier partial capture", async () => {
  const db = new NewsArchive(":memory:");
  try {
    const id = seed(db);
    await new ArticleWorker(db, {
      get: async (s, u, k) => {
        if (k === "image") throw new CaptureError("HTTP 503");
        return resource(s, u, k);
      },
    }).tick();
    db.database.exec(
      "UPDATE capture_jobs SET next_attempt_at='2000-01-01T00:00:00Z'",
    );
    await new ArticleWorker(db, {
      get: async () => {
        throw new CaptureError("HTTP 404", true);
      },
    }).tick();
    assert.equal(db.detail(id)!.preservation.jobs[0].status, "partial");
    assert.equal(db.detail(id)!.preservation.captures.length, 1);
  } finally {
    db.close();
  }
});

test("capture URLs restrict hosts, protocols, credentials and every redirect; robots restrictions are honored", async () => {
  for (const u of [
    "http://www.antaranews.com/a",
    "https://127.0.0.1/a",
    "https://www.antaranews.com.evil.test/a",
    "https://user:pass@www.antaranews.com/a",
    "https://www.antaranews.com:3000/a",
  ])
    assert.throws(() => allowedCaptureUrl("antara", u, "page"));
  const requested: string[] = [];
  const transport: ArchiveTransport = async (u) => {
    requested.push(u);
    return u.endsWith("robots.txt")
      ? new Response("User-agent: *\nAllow: /", {
          headers: { "content-type": "text/plain" },
        })
      : new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data/" },
        });
  };
  await assert.rejects(
    new ArticleFetcher(transport, 0).get("antara", url, "page"),
    /Host/,
  );
  assert.equal(requested.length, 2);
  const denied: string[] = [];
  await assert.rejects(
    new ArticleFetcher(async (u) => {
      denied.push(u);
      return new Response("User-agent: PANTAU\nDisallow: /");
    }, 0).get("antara", url, "page"),
    /robots/,
  );
  assert.equal(denied.length, 1);
  assert.equal(verifiedImageMime(png, "image/png"), "image/png");
  assert.throws(() =>
    verifiedImageMime(Buffer.from('<svg onload="alert(1)">'), "image/svg+xml"),
  );
  assert.throws(() => verifiedImageMime(Buffer.from("<html>"), "image/png"));
});

test("resource requests enforce limits, redirect length, retries and MIME checks", async () => {
  const make = (handler: ArchiveTransport) =>
    new ArticleFetcher(
      async (u) =>
        u.endsWith("/robots.txt")
          ? new Response("", { status: 404 })
          : handler(u),
      0,
    );
  await assert.rejects(
    make(
      async () =>
        new Response("large", {
          headers: {
            "content-length": String(6 * 1024 * 1024),
            "content-type": "text/html",
          },
        }),
    ).get("antara", url, "page"),
    /Ukuran/,
  );
  await assert.rejects(
    make(
      async () =>
        new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
          headers: { "content-type": "text/html" },
        }),
    ).get("antara", url, "page"),
    /Ukuran/,
  );
  await assert.rejects(
    make(async () => new Response("x", { status: 503 })).get(
      "antara",
      url,
      "page",
    ),
    (e) => e instanceof CaptureError && !e.permanent,
  );
  const before = Date.now();
  await assert.rejects(
    make(
      async () =>
        new Response("throttled", {
          status: 429,
          headers: { "retry-after": "3600" },
        }),
    ).get("antara", url, "page"),
    (e) =>
      e instanceof CaptureError &&
      !!e.retryAt &&
      Date.parse(e.retryAt) >= before + 3600_000,
  );
  await assert.rejects(
    make(
      async () =>
        new Response("x", { headers: { "content-type": "application/json" } }),
    ).get("antara", url, "page"),
    /bukan halaman/,
  );
  await assert.rejects(
    make(
      async () =>
        new Response(null, { status: 302, headers: { location: "/loop" } }),
    ).get("antara", url, "page"),
    /Redirect/,
  );
});

test("same-article pagination is preserved and unrelated next links never crawl other stories", async () => {
  const db = new NewsArchive(":memory:");
  try {
    const id = seed(db);
    const worker = new ArticleWorker(db, {
      get: async (s, u, k) =>
        k === "image"
          ? resource(s, u, k)
          : {
              ...(await resource(s, u, k)),
              bytes: Buffer.from(
                html +
                  (u.endsWith("/2")
                    ? ""
                    : `<a rel="next" href="${url}/2">Selanjutnya</a>`),
              ),
            },
    });
    await worker.tick();
    assert.equal(db.detail(id)!.preservation.captures[0].pages.length, 2);
    const external = extractArticle(
      html + '<a rel="next" href="https://example.com/other">Next</a>',
      url,
      "antara",
    );
    assert.equal(external.nextPage, null);
    assert.ok(external.warnings.length);
  } finally {
    db.close();
  }
});

test("archive asset endpoints require auth, scope assets to their article/capture and serve HTML as attachment", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-assets-"));
  const path = join(dir, "news.sqlite");
  const db = new NewsArchive(path);
  const id = seed(db);
  await new ArticleWorker(db, { get: resource }).tick();
  const c = db.detail(id)!.preservation.captures[0];
  db.close();
  const app = createApp({
      archivePath: path,
      cacheDir: dir,
      apiToken: "fixture-token",
    }),
    server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/archive/`,
      p = `${id}/captures/${c.id}/assets/`,
      headers = { Authorization: "Bearer fixture-token" };
    assert.equal((await fetch(base + p + c.photos[0].assetHash)).status, 401);
    const image = await fetch(base + p + c.photos[0].assetHash, { headers });
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    const page = await fetch(base + p + c.pages[0].htmlHash, { headers });
    assert.equal(page.headers.get("content-type"), "application/octet-stream");
    assert.match(page.headers.get("content-disposition")!, /^attachment/);
    assert.match(page.headers.get("content-security-policy")!, /sandbox/);
    assert.equal(await page.text(), html);
    assert.equal(
      (
        await fetch(
          base + `wrong/captures/${c.id}/assets/${c.photos[0].assetHash}`,
          { headers },
        )
      ).status,
      404,
    );
    assert.equal((await fetch(base + p + "bad", { headers })).status, 400);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await app.locals.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
