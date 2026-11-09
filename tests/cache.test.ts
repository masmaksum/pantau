import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceCache } from "../server/cache.js";

test("concurrent requests share a load, and a fresh result is reused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-cache-"));
  try {
    const cache = new SourceCache(dir);
    let calls = 0;
    const loader = async () => {
      calls++;
      return ["report"];
    };
    const [a, b] = await Promise.all([
      cache.get("news", 60_000, loader),
      cache.get("news", 60_000, loader),
    ]);
    assert.deepEqual(a.value, b.value);
    assert.equal(calls, 1);
    await cache.get("news", 60_000, loader);
    assert.equal(calls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("last good data survives a restart, with the original timestamp on failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-cache-"));
  try {
    const first = await new SourceCache(dir, 0).get("news", 0, async () => [
      "last-good",
    ]);
    const failed = await new SourceCache(dir, 0).get("news", 0, async () => {
      throw new Error("HTTP 403");
    });
    assert.equal(failed.status, "stale");
    assert.equal(failed.fetchedAt, first.fetchedAt);
    assert.deepEqual(failed.value, ["last-good"]);
    assert.equal(failed.message, "HTTP 403");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("a new source failure has no fabricated data and masks credential-bearing errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-cache-"));
  try {
    const result = await new SourceCache(dir).get("firms", 0, async () => {
      throw new Error("https://api.example/secret-api-key");
    });
    assert.equal(result.status, "error");
    assert.equal(result.value, null);
    assert.equal(result.fetchedAt, null);
    assert.equal(result.message?.includes("secret"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("failed sources back off and never treat failure as successful empty data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-cache-"));
  try {
    const cache = new SourceCache(dir);
    let calls = 0;
    const loader = async (): Promise<string[]> => {
      calls++;
      throw new Error("HTTP 503");
    };
    await cache.get("news", 0, loader);
    const r = await cache.get("news", 0, loader);
    assert.equal(calls, 1);
    assert.equal(r.status, "error");
    assert.equal(r.value, null);
    await assert.rejects(() => cache.get("../escape", 1, async () => []));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
