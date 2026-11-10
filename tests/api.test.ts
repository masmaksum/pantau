import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import { isCamera } from "../server/config.js";

test("API access token is enforced; visitor input cannot become a fetch URL", async () => {
  const server = createApp({ apiToken: "test-token" }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/api/cities`)).status, 401);
    const headers = { authorization: "Bearer test-token" };
    const cities = await fetch(`${base}/api/cities`, { headers });
    assert.equal(cities.status, 200);
    assert.equal(cities.headers.get("cache-control"), "no-store");
    assert.equal(
      (await cities.json()).some((c: { name: string }) => c.name === "jakarta"),
      true,
    );
    assert.equal(
      (await fetch(`${base}/api/weather?city=http://127.0.0.1`, { headers }))
        .status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/situation?hours=9999`, { headers })).status,
      400,
    );
    assert.equal(
      (await fetch(`${base}/api/read?u=http://localhost`, { headers })).status,
      404,
    );
    const cameras = await (
      await fetch(`${base}/api/cameras`, { headers })
    ).json();
    assert.deepEqual(cameras.cameras, []);
    assert.equal(cameras.status, "unconfigured");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test("operator config rejects unsafe media links", () => {
  assert.equal(
    isCamera({
      id: "cam",
      name: "Test",
      region: "Test",
      type: "hls",
      url: "javascript:alert(1)",
      sourceUrl: "https://example.com",
    }),
    false,
  );
});
