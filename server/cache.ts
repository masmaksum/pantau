import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface Cached<T> {
  value: T | null;
  fetchedAt: string | null;
  attemptedAt: string;
  status: "ok" | "stale" | "error";
  message?: string;
}
interface Entry<T> {
  value: T;
  fetchedAt: string;
}
export class SourceCache {
  private memory = new Map<string, Entry<unknown>>();
  private pending = new Map<string, Promise<Cached<unknown>>>();
  private lastAttempt = new Map<string, Cached<unknown>>();
  constructor(
    private directory: string,
    private retryMs = 30_000,
  ) {}
  async get<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<Cached<T>> {
    if (!/^[a-z0-9_-]+$/i.test(key)) throw new Error("Invalid cache key");
    const active = this.pending.get(key);
    if (active) return active as Promise<Cached<T>>;
    const task = this.load(key, ttlMs, loader);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  private async load<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<Cached<T>> {
    const attemptedAt = new Date().toISOString();
    let entry = this.memory.get(key) as Entry<T> | undefined;
    if (!entry) {
      try {
        const disk = JSON.parse(
          await readFile(join(this.directory, `${key}.json`), "utf8"),
        ) as Entry<T>;
        if (Number.isFinite(Date.parse(disk.fetchedAt)) && "value" in disk) {
          entry = disk;
          this.memory.set(key, disk);
        }
      } catch {
        /* No last-good snapshot yet. */
      }
    }
    if (entry && Date.now() - Date.parse(entry.fetchedAt) < ttl)
      return { ...entry, status: "ok", attemptedAt };
    const last = this.lastAttempt.get(key) as Cached<T> | undefined;
    if (last && Date.now() - Date.parse(last.attemptedAt) < this.retryMs)
      return last;
    let result: Cached<T>;
    try {
      const value = await loader();
      const fetchedAt = new Date().toISOString();
      const next = { value, fetchedAt };
      this.memory.set(key, next);
      // Persistence is best effort; a read-only disk does not turn a successful feed into an outage.
      try {
        await mkdir(this.directory, { recursive: true });
        const target = join(this.directory, `${key}.json`);
        const temp = `${target}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
        await rename(temp, target);
      } catch {
        /* In-memory cache remains usable. */
      }
      result = { value, fetchedAt, attemptedAt, status: "ok" };
    } catch (error) {
      const reason =
        error instanceof Error && /^HTTP \d+$/.test(error.message)
          ? error.message
          : "Sumber tidak dapat diambil atau format berubah";
      result = {
        value: entry?.value ?? null,
        fetchedAt: entry?.fetchedAt ?? null,
        attemptedAt,
        status: entry ? "stale" : "error",
        message: reason,
      };
    }
    this.lastAttempt.set(key, result);
    return result;
  }
}
