import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import {
  officialSocialStates,
  collectOfficialSocial,
  normalizeOfficialSocialPost,
} from "../server/social-official.js";
import { createApp } from "../server/app.js";

test("all five official routes are prepared with empty credentials and no enabled collector", async () => {
  const states = officialSocialStates({});
  assert.deepEqual(
    states.map((p) => p.platform),
    ["x", "threads", "instagram", "facebook", "tiktok"],
  );
  assert.equal(
    states.every(
      (p) =>
        p.enabled === false &&
        p.collectorImplemented === false &&
        p.stage === "configuration_missing",
    ),
    true,
  );
  const example = await readFile(".env.example", "utf8");
  for (const name of new Set(
    states.flatMap((p) => [...p.credentialVariables, ...p.targetVariables]),
  ))
    assert.match(example, new RegExp(`^${name}=$`, "m"));
});

test("filled values stay unverified and dormant; no tokens, IDs or queries are returned", async () => {
  const variables = new Set(
    officialSocialStates({}).flatMap((p) => [
      ...p.credentialVariables,
      ...p.targetVariables,
    ]),
  );
  const env = Object.fromEntries(
    [...variables].map((name) => [name, `private-value-${name}`]),
  );
  const result = await collectOfficialSocial(env);
  assert.equal(
    result.providers.every(
      (p) =>
        p.credentialsPresent &&
        p.stage === "implementation_pending" &&
        !p.enabled,
    ),
    true,
  );
  assert.deepEqual(result.events, []);
  assert.equal(
    result.sources.every(
      (s) =>
        s.status === "unconfigured" && s.count === 0 && s.fetchedAt === null,
    ),
    true,
  );
  assert.equal(JSON.stringify(result).includes("private-value-"), false);
});

test("normalization preserves provenance, applies HAM priority, and never invents social geolocation", () => {
  const post = {
    platform: "x" as const,
    id: "123",
    text: "Aktivis ditangkap saat menolak investasi tambang di Bandung",
    url: "https://x.com/example/status/123",
    publishedAt: "2026-11-10T00:00:00Z",
  };
  const event = normalizeOfficialSocialPost(post)!;
  assert.equal(event.source, "X");
  assert.equal(event.category, "ham-aktivis");
  assert.equal(event.verification, "reported");
  assert.equal(event.location, null);
  assert.equal(event.title, post.text);
  assert.equal(event.publishedAt, "2026-11-10T00:00:00.000Z");
  assert.equal(
    normalizeOfficialSocialPost({ ...post, text: "IHSG dan rupiah menguat" }),
    null,
  );
});

test("normalization rejects unsafe links, wrong platform permalinks, and incomplete timestamps", () => {
  const p = {
    platform: "threads" as const,
    id: "1",
    text: "Banjir di Semarang",
    url: "https://www.threads.com/@example/post/one",
    publishedAt: "2026-11-10T00:00:00Z",
  };
  assert.ok(normalizeOfficialSocialPost(p));
  assert.equal(
    normalizeOfficialSocialPost({ ...p, url: "javascript:alert(1)" }),
    null,
  );
  assert.equal(
    normalizeOfficialSocialPost({ ...p, url: "https://evil.example/post/1" }),
    null,
  );
  assert.equal(
    normalizeOfficialSocialPost({
      ...p,
      url: "https://threads.com.evil.example/post/1",
    }),
    null,
  );
  assert.equal(
    normalizeOfficialSocialPost({ ...p, publishedAt: "2026" }),
    null,
  );
  assert.equal(normalizeOfficialSocialPost({ ...p, id: "" }), null);
});

test("provider status API is protected, and old social RSS caches cannot reappear in situation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-official-social-"));
  const now = new Date().toISOString();
  for (const id of ["antara", "detik", "bmkg"])
    await writeFile(
      join(dir, `${id}.json`),
      JSON.stringify({ value: [], fetchedAt: now }),
    );
  await writeFile(
    join(dir, "social-x.json"),
    JSON.stringify({
      fetchedAt: now,
      value: [
        {
          id: "legacy-social-post",
          title: "Old RSS post",
          url: "https://x.com/legacy/status/1",
          publishedAt: now,
        },
      ],
    }),
  );
  const app = createApp({
    archivePath: ":memory:",
    cacheDir: dir,
    apiToken: "test-api-token",
    socialEnvironment: {
      X_BEARER_TOKEN: "private-bearer",
      X_SEARCH_QUERY: "private-query",
      SOCIAL_CONFIG: "https://not-an-official-provider.example/rss",
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/api/social/providers`)).status, 401);
    const headers = { Authorization: "Bearer test-api-token" };
    const data = await (
      await fetch(`${base}/api/social/providers`, { headers })
    ).json();
    assert.equal(data.policy, "official-only");
    assert.equal(data.enabled, false);
    assert.equal(data.providers.length, 5);
    assert.equal(JSON.stringify(data).includes("private-bearer"), false);
    assert.equal(JSON.stringify(data).includes("private-query"), false);
    const situation = await (
      await fetch(`${base}/api/situation`, { headers })
    ).json();
    assert.deepEqual(situation.events, []);
    const social = situation.sources.filter((s: { id: string }) =>
      s.id.startsWith("social-"),
    );
    assert.equal(social.length, 5);
    assert.equal(
      social.every((s: any) => s.count === 0 && s.status === "unconfigured"),
      true,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.locals.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
