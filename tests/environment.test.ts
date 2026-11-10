import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.js";
import {
  parseAir,
  parseBiodiversity,
  parseContext,
  loadContextFile,
} from "../server/environment.js";
import {
  datasets,
  forestTileUrl,
  validSatelliteDate,
} from "../shared/environment.js";

test("model air values preserve missing data and explicit time instead of inventing zero", () => {
  const a = parseAir(
    {
      latitude: -6.2,
      longitude: 106.8,
      current: { time: "2026-11-10T06:00", pm2_5: 40, pm10: null, us_aqi: 120 },
      hourly: { time: ["2026-11-10T06:00"], pm2_5: [null] },
    },
    "jakarta",
  );
  assert.equal(a.pm25, 40);
  assert.equal(a.pm10, null);
  assert.equal(a.hourly[0].pm25, null);
  assert.equal(a.time, "2026-11-10T06:00+07:00");
  assert.throws(() => parseAir({ message: "denied" }, "jakarta"));
});
test("GBIF statistics are occurrence records and do not expose locations or count species", () => {
  const b = parseBiodiversity(
    {
      count: 100,
      facets: [
        {
          field: "IUCN_RED_LIST_CATEGORY",
          counts: [
            { name: "CR", count: 8 },
            { name: "EN", count: 12 },
            { name: "invalid", count: 9 },
          ],
        },
      ],
    },
    2026,
  );
  assert.equal(b.records, 100);
  assert.equal(b.threatCounts.length, 2);
  assert.equal("coordinates" in b, false);
  assert.equal("speciesCount" in b, false);
  assert.throws(() => parseBiodiversity({ count: 1, facets: [] }, 2026));
});
test("context rejects wrong coordinates, unclosed polygons, arbitrary properties, and undated disaster records", () => {
  const feature = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [110, -2] },
    properties: {
      name: "Arsip",
      date: "2020-01-01",
      eventType: "Banjir",
      unsafe: "<script>bad</script>",
    },
  };
  const fc = {
    type: "FeatureCollection",
    features: [
      feature,
      { ...feature, geometry: { type: "Point", coordinates: [999, 90] } },
      { ...feature, properties: { eventType: "Gempa" } },
    ],
  };
  const result = parseContext(fc, "bnpb-history");
  assert.equal(result.features.length, 1);
  assert.equal(result.rejected, 2);
  assert.equal("unsafe" in result.features[0].properties, false);
  assert.equal(
    parseContext(
      {
        type: "FeatureCollection",
        features: [
          {
            ...feature,
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [110, -2],
                  [111, -2],
                  [111, -3],
                  [110, -3],
                ],
              ],
            },
          },
        ],
      },
      "mangrove",
    ).rejected,
    1,
  );
});
test("large context imports explicitly mark truncation", () => {
  const f = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [110, -2] },
    properties: {},
  };
  const result = parseContext(
    { type: "FeatureCollection", features: Array(1002).fill(f) },
    "mangrove",
  );
  assert.equal(result.features.length, 1000);
  assert.equal(result.truncated, true);
});
test("satellite dates reject rollover/future dates; GFW request uses documented true-color API", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(validSatelliteDate("2026-11-09", now), true);
  assert.equal(validSatelliteDate("2026-11-10", now), false);
  assert.equal(validSatelliteDate("2026-02-30", now), false);
  assert.equal(validSatelliteDate("2010-01-01", now), false);
  assert.match(forestTileUrl(2025), /render_type=true_color/);
  assert.throws(() => forestTileUrl(2026));
});
test("context paths cannot read outside configured directory", async () => {
  await assert.rejects(() =>
    loadContextFile("../secret.geojson", "mangrove", "/tmp/pantau-test-root"),
  );
});
test("environment endpoints enforce auth, honest setup states and fixed data paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-environment-"));
  const now = new Date().toISOString();
  await writeFile(
    join(dir, "gbif-indonesia.json"),
    JSON.stringify({
      fetchedAt: now,
      value: {
        records: 12,
        threatCounts: [],
        startYear: 1990,
        endYear: 2026,
        scope: "Indonesia",
      },
    }),
  );
  const manifest = join(dir, "context.json");
  await writeFile(
    manifest,
    JSON.stringify([
      {
        id: "mangrove",
        file: "mangrove.geojson",
        sourceUrl: "https://www.globalmangrovewatch.org/",
        license: "CC BY 4.0",
        vintage: "Fixture for import test, not a real dataset",
      },
    ]),
  );
  await writeFile(
    join(dir, "mangrove.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [110, -2] },
          properties: {
            name: "Test fixture",
            privateValue: "must not pass through",
          },
        },
      ],
    }),
  );
  const app = createApp({
    archivePath: ":memory:",
    cacheDir: dir,
    apiToken: "secret",
    contextManifest: manifest,
    contextRoot: dir,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/api/datasets`)).status, 401);
    const headers = { Authorization: "Bearer secret" };
    const d = await (await fetch(`${base}/api/datasets`, { headers })).json();
    assert.equal(
      d.datasets.find((x: any) => x.id === "trase").access,
      "excluded",
    );
    assert.equal(
      d.datasets.find((x: any) => x.id === "oil-palm").configured,
      false,
    );
    assert.equal(
      d.datasets.find((x: any) => x.id === "wdpa").configured,
      false,
    );
    assert.equal(
      (await fetch(`${base}/api/context/wdpa`, { headers })).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/api/air-quality?city=https://localhost`, {
          headers,
        })
      ).status,
      400,
    );
    const result = await (
      await fetch(`${base}/api/context/oil-palm`, { headers })
    ).json();
    assert.equal(result.status, "unconfigured");
    assert.equal(result.value, null);
    const bio = await (
      await fetch(`${base}/api/biodiversity`, { headers })
    ).json();
    assert.equal(bio.value.records, 12);
    assert.equal(bio.status, "ok");
    assert.equal(datasets.filter((d) => d.id === "gbif").length, 1);
    assert.equal(
      d.datasets.find((x: any) => x.id === "mangrove").configured,
      true,
    );
    const imported = await (
      await fetch(`${base}/api/context/mangrove`, { headers })
    ).json();
    assert.equal(imported.value.features.length, 1);
    assert.equal(imported.value.features[0].properties.name, "Test fixture");
    assert.equal(
      "privateValue" in imported.value.features[0].properties,
      false,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.locals.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
