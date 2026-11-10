import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { NEWS_FEEDS, loadFeed } from "../server/providers.js";
import { isAllowedReport, applyTopicPolicy } from "../shared/topic-policy.js";
import { NewsArchive, currentPolicySnapshot } from "../server/archive.js";
import { ArticleWorker } from "../server/article-worker.js";
import { bytesHash } from "../server/article-store.js";

const dir = await mkdtemp(join(tmpdir(), "pantau-preservation-smoke-"));
const db = new NewsArchive(join(dir, "news.sqlite"));
try {
  for (const feed of NEWS_FEEDS) {
    const events = (await loadFeed(feed.url, feed.name))
      .map(applyTopicPolicy)
      .filter(isAllowedReport);
    if (!events.length)
      throw new Error(`Tidak ada berita yang lolos: ${feed.id}`);
    db.preserveBatch(
      {
        sourceId: feed.id,
        sourceName: feed.name,
        sourceUrl: feed.url,
        fetchedAt: new Date().toISOString(),
        acquisition: "feed-snapshot",
      },
      [events[0]],
      currentPolicySnapshot(),
    );
  }
  const worker = new ArticleWorker(db);
  await worker.tick(2);
  await worker.stop();
  for (const article of db.list({ limit: 10, offset: 0 }).items) {
    const saved = db.detail(article.id)!.preservation;
    const capture = saved.captures.at(-1);
    if (!capture || capture.text.length < 120)
      throw new Error(
        `${article.sourceId}: tidak ada teks halaman yang tersimpan; ${JSON.stringify(saved.jobs)}`,
      );
    if (!capture.photos.length || !capture.photos.every((p) => p.assetHash))
      throw new Error(
        `${article.sourceId}: foto belum tersimpan lengkap; ${JSON.stringify(capture.photos)}; ${capture.warnings.join("; ")}`,
      );
    for (const hash of [
      ...capture.pages.map((p) => p.htmlHash),
      ...capture.photos.map((p) => p.assetHash!),
    ]) {
      const asset = db.content.asset(article.id, capture.id, hash);
      if (!asset || bytesHash(asset.data) !== hash)
        throw new Error("Hash aset gagal diverifikasi");
    }
    console.log(
      `${article.sourceId}: ${capture.status}; ${capture.text.length} characters; ${capture.pages.length} pages; ${capture.photos.length} locally saved photos; ${capture.photos.filter((p) => p.caption).length} captions; warnings: ${capture.warnings.join("; ") || "none"}`,
    );
  }
  const target = join(dir, "backup.sqlite");
  await backup(db.database, target);
  const restored = new NewsArchive(target);
  try {
    if (
      restored.database
        .prepare("SELECT COUNT(*) AS n FROM capture_assets")
        .get()?.n !==
      db.database.prepare("SELECT COUNT(*) AS n FROM capture_assets").get()?.n
    )
      throw new Error("Backup aset tidak cocok");
  } finally {
    restored.close();
  }
  console.log(
    "Live preservation + backup smoke passed. Temporary captures removed after verification.",
  );
} finally {
  db.close();
  await rm(dir, { recursive: true, force: true });
}
