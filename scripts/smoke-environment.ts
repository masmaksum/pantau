import { createApp } from "../server/app.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { EnvHttpProxyAgent, fetch as upstream } from "undici";
import { forestTileUrl } from "../shared/environment.js";

const directory = await mkdtemp(join(tmpdir(), "pantau-environment-smoke-"));
const app = createApp({
  archivePath: join(directory, "news.sqlite"),
  cacheDir: directory,
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const dispatcher = new EnvHttpProxyAgent();
try {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const results = await Promise.all(
    ["/api/air-quality?city=jakarta", "/api/biodiversity", "/api/datasets"].map(
      async (path) => {
        const response = await fetch(base + path);
        const data = await response.json();
        if (!response.ok || (!data.value && !data.datasets))
          throw new Error(`${path}: unavailable`);
        console.log(
          `${path}: ${data.status ?? "catalog"}${data.value?.records ? `, ${data.value.records} GBIF occurrence records` : ""}`,
        );
        return data;
      },
    ),
  );
  if (results[0].value.pm25 === null) throw new Error("Model PM2.5 missing");
  const date = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const forest = forestTileUrl(2025)
    .replace("{z}", "4")
    .replace("{x}", "12")
    .replace("{y}", "8");
  const nasa = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/4/8/12.jpg`;
  const hot = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?service=WMS&version=1.3.0&request=GetMap&layers=VIIRS_NOAA20_Thermal_Anomalies_375m_All&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox=10018754,-2504688,12523442,0&time=${date}`;
  await Promise.all(
    [
      ["GFW true-color loss", forest],
      ["NASA MODIS imagery", nasa],
      ["NASA NOAA-20 hotspots", hot],
    ].map(async ([name, url]) => {
      const response = await upstream(url, {
        dispatcher,
        signal: AbortSignal.timeout(25_000),
      });
      const content = response.headers.get("content-type") ?? "";
      const bytes = Buffer.from(await response.arrayBuffer());
      const image =
        bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
        bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"));
      // NASA may return HTTP 200 with an XML ServiceException; HTTP alone is insufficient.
      if (!response.ok || !content.startsWith("image/") || !image)
        throw new Error(
          `${name}: invalid raster (${response.status}, ${content})`,
        );
      console.log(
        `${name}: ${content}, ${bytes.length} bytes, verified image signature`,
      );
    }),
  );
  console.log(
    `Environment smoke passed. NASA date: ${date} UTC. Browser rendering and key-based GFW vectors remain unverified.`,
  );
} finally {
  await dispatcher.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await app.locals.dispose();
  await rm(directory, { recursive: true, force: true });
}
