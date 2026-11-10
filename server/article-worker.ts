import type { NewsArchive } from "./archive.js";
import {
  ArticleFetcher,
  CaptureError,
  verifiedImageMime,
} from "./article-fetch.js";
import { extractArticle } from "./article-extract.js";
import {
  bytesHash,
  type PendingCapture,
  type StoredAsset,
} from "./article-store.js";
import type { ArticleCapture, PreservedPhoto } from "../shared/archive.js";

export class ArticleWorker {
  private pending: Promise<void> | null = null;
  private stopped = false;
  constructor(
    private archive: NewsArchive,
    private fetcher: Pick<ArticleFetcher, "get"> = new ArticleFetcher(),
  ) {}
  tick(limit = 2) {
    if (this.stopped) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.drain(limit).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async stop() {
    this.stopped = true;
    await this.pending;
  }
  private async drain(limit: number) {
    for (let i = 0; i < limit && !this.stopped; i++) {
      const job = this.archive.content.claim();
      if (!job) return;
      try {
        await this.capture(job);
      } catch (error) {
        this.archive.content.fail(
          job,
          error instanceof CaptureError
            ? error.message
            : "Pengambilan atau penyimpanan halaman gagal",
          error instanceof CaptureError && error.permanent,
          error instanceof CaptureError ? error.retryAt : undefined,
        );
      }
    }
  }
  private async capture(job: PendingCapture) {
    const assets: StoredAsset[] = [];
    const pages: ArticleCapture["pages"] = [],
      photos: PreservedPhoto[] = [],
      warnings: string[] = [],
      texts: string[] = [];
    let title = "",
      byline: string | null = null,
      next: string | null = job.url,
      totalImageBytes = 0;
    const visited = new Set<string>();
    let retryAt: string | undefined;
    const noteRetry = (error: unknown) => {
      if (
        error instanceof CaptureError &&
        error.retryAt &&
        (!retryAt || error.retryAt > retryAt)
      )
        retryAt = error.retryAt;
    };
    for (let index = 0; next && index < 5; index++) {
      if (visited.has(next)) {
        warnings.push("Siklus pagination; halaman berikutnya tidak diambil");
        break;
      }
      visited.add(next);
      try {
        const page = await this.fetcher.get(job.sourceId, next, "page");
        const extracted = extractArticle(
          page.bytes.toString("utf8"),
          page.url,
          job.sourceId,
        );
        const htmlHash = bytesHash(page.bytes);
        assets.push({ hash: htmlHash, mime: "text/html", data: page.bytes });
        pages.push({ url: page.url, fetchedAt: page.fetchedAt, htmlHash });
        if (!title) title = extracted.title;
        if (!byline) byline = extracted.byline;
        texts.push(extracted.text);
        warnings.push(...extracted.warnings);
        for (const image of extracted.photos) {
          if (photos.some((p) => p.sourceUrl === image.sourceUrl)) continue;
          if (photos.length >= 20) {
            warnings.push("Batas 20 foto per snapshot tercapai");
            break;
          }
          const photo: PreservedPhoto = { ...image, assetHash: null };
          try {
            if (totalImageBytes >= 64 * 1024 * 1024)
              throw new CaptureError("Batas total 64 MiB foto tercapai", true);
            const resource = await this.fetcher.get(
              job.sourceId,
              image.sourceUrl,
              "image",
            );
            if (totalImageBytes + resource.bytes.length > 64 * 1024 * 1024)
              throw new CaptureError("Batas total 64 MiB foto tercapai", true);
            const mime = verifiedImageMime(resource.bytes, resource.mime),
              hash = bytesHash(resource.bytes);
            totalImageBytes += resource.bytes.length;
            assets.push({ hash, mime, data: resource.bytes });
            Object.assign(photo, {
              assetHash: hash,
              mime,
              bytes: resource.bytes.length,
            });
          } catch (error) {
            noteRetry(error);
            photo.error =
              error instanceof CaptureError
                ? error.message
                : "Foto gagal diambil";
            warnings.push(photo.error);
          }
          photos.push(photo);
        }
        next = extracted.nextPage;
      } catch (error) {
        if (!pages.length) throw error;
        noteRetry(error);
        warnings.push(
          error instanceof CaptureError
            ? `Halaman lanjutan: ${error.message}`
            : "Halaman lanjutan gagal diambil",
        );
        next = null;
      }
    }
    if (next)
      warnings.push(
        "Batas lima halaman tercapai; artikel mungkin belum lengkap",
      );
    this.archive.content.finish(
      job,
      {
        capturedAt: new Date().toISOString(),
        extractor: "publisher-dom-v1",
        title,
        byline,
        text: texts.filter(Boolean).join("\n\n"),
        pages,
        photos,
        warnings: [...new Set(warnings)],
        status: warnings.length ? "partial" : "complete",
      },
      assets,
      retryAt,
    );
  }
}
