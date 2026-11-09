import "dotenv/config";
import { createApp } from "../server/app.js";
import type { AddressInfo } from "node:net";
import type { Snapshot } from "../shared/types.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "pantau-smoke-"));
const server = createApp({
  cacheDir: directory,
  firmsKey: process.env.FIRMS_MAP_KEY,
}).listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
try {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await fetch(`${base}/api/situation?hours=24`);
  const result = (await response.json()) as Snapshot;
  if (!response.ok || !Array.isArray(result.events))
    throw new Error("Invalid situation response");
  for (const source of result.sources)
    console.log(
      `${source.id}: ${source.status}, ${source.count} items${source.message ? ` (${source.message})` : ""}`,
    );
  console.log(
    `${result.events.length} reports in 24h; ${result.events.filter((e) => e.location).length} with locations`,
  );
  if (!result.sources.some((s) => s.status === "ok" && s.count > 0))
    throw new Error("No live provider is available");
  const weather = await fetch(`${base}/api/weather?city=jakarta`);
  const forecast = await weather.json();
  console.log(`Open-Meteo: HTTP ${weather.status}, ${forecast.status}`);
  if (!weather.ok || !forecast.value)
    throw new Error("Live weather unavailable");
  const home = await fetch(base);
  if (!home.ok || !(await home.text()).includes("PANTAU"))
    throw new Error("Built frontend not served");
  console.log(
    "Live HTTP smoke passed. BMKG/FIRMS statuses above remain authoritative.",
  );
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(directory, { recursive: true, force: true });
}
