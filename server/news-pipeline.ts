import type { Event, SourceStatus } from "../shared/types.js";
import { applyTopicPolicy, isAllowedReport } from "../shared/topic-policy.js";
import { SourceCache } from "./cache.js";
import { currentPolicySnapshot, NewsArchive } from "./archive.js";
import { loadFeed, NEWS_FEEDS } from "./providers.js";

export class NewsPipeline {
  private policy = currentPolicySnapshot();
  private pending: Promise<
    { events: Event[]; sources: SourceStatus[] }[]
  > | null = null;
  private archiveError: string | undefined;
  constructor(
    private cache: SourceCache,
    readonly archive: NewsArchive,
  ) {}
  poll() {
    if (this.pending) return this.pending;
    this.pending = this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async load() {
    const failures: string[] = [];
    const result = await Promise.all(
      NEWS_FEEDS.map(async (feed) => {
        const r = await this.cache.get<Event[]>(feed.id, 120_000, () =>
          loadFeed(feed.url, feed.name),
        );
        const events = (r.value ?? [])
          .map(applyTopicPolicy)
          .filter(isAllowedReport);
        if (r.value && r.fetchedAt) {
          try {
            this.archive.preserveBatch(
              {
                sourceId: feed.id,
                sourceName: feed.name,
                sourceUrl: feed.url,
                fetchedAt: r.fetchedAt,
                acquisition:
                  r.status === "stale" ? "last-good-cache" : "feed-snapshot",
              },
              events,
              this.policy,
            );
          } catch {
            failures.push(feed.name);
          }
        }
        return {
          events,
          sources: [
            {
              id: feed.id,
              name: feed.name,
              url: feed.url,
              status: r.status,
              fetchedAt: r.fetchedAt,
              attemptedAt: r.attemptedAt,
              count: events.length,
              message: r.message,
            } satisfies SourceStatus,
          ],
        };
      }),
    );
    this.archiveError = failures.length
      ? `Penyimpanan arsip gagal untuk ${failures.join(", ")}. Berita live belum terjamin tersimpan.`
      : undefined;
    return result;
  }
  idle() {
    return this.pending ?? Promise.resolve();
  }
  health() {
    return {
      status: this.archiveError ? ("error" as const) : ("ok" as const),
      message: this.archiveError,
      ...this.archive.stats(),
    };
  }
}
