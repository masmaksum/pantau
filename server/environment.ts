import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type {
  AirQuality,
  Biodiversity,
  ContextCollection,
  ContextFeature,
} from "../shared/environment.js";
import { gfwVectors } from "../shared/environment.js";
import { download, downloadJson } from "./http.js";

const nullable = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export function parseAir(data: any, city: string): AirQuality {
  if (
    !data?.current ||
    typeof data.current.time !== "string" ||
    !Array.isArray(data.hourly?.time) ||
    !Number.isFinite(data.latitude) ||
    !Number.isFinite(data.longitude)
  )
    throw new Error("Invalid air response");
  const time = `${data.current.time}+07:00`;
  if (!Number.isFinite(Date.parse(time))) throw new Error("Invalid model time");
  return {
    city,
    latitude: data.latitude,
    longitude: data.longitude,
    time,
    pm25: nullable(data.current.pm2_5),
    pm10: nullable(data.current.pm10),
    usAqi: nullable(data.current.us_aqi),
    hourly: data.hourly.time
      .slice(0, 48)
      .map((time: string, i: number) => ({
        time: `${time}+07:00`,
        pm25: nullable(data.hourly.pm2_5?.[i]),
      })),
  };
}
export async function loadAir(
  city: string,
  lat: number,
  lon: number,
): Promise<AirQuality> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "pm2_5,pm10,us_aqi",
    hourly: "pm2_5",
    forecast_days: "2",
    domains: "cams_global",
    timezone: "Asia/Jakarta",
  });
  return parseAir(
    await downloadJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${q}`,
    ),
    city,
  );
}
export function parseBiodiversity(data: any, endYear: number): Biodiversity {
  if (
    !Number.isSafeInteger(data?.count) ||
    data.count < 0 ||
    !Array.isArray(data.facets)
  )
    throw new Error("Invalid GBIF response");
  const facet = data.facets.find(
    (f: any) => f.field === "IUCN_RED_LIST_CATEGORY",
  );
  if (!facet || !Array.isArray(facet.counts))
    throw new Error("Missing GBIF facet");
  return {
    scope: "Indonesia · catatan keberadaan 1990–tahun berjalan",
    startYear: 1990,
    endYear,
    records: data.count,
    threatCounts: facet.counts
      .filter(
        (c: any) =>
          ["CR", "EN", "VU", "NT", "LC", "DD", "EX", "EW"].includes(c.name) &&
          Number.isSafeInteger(c.count) &&
          c.count >= 0,
      )
      .map((c: any) => ({ code: c.name, count: c.count })),
  };
}
export async function loadBiodiversity(): Promise<Biodiversity> {
  const endYear = new Date().getUTCFullYear();
  const q = new URLSearchParams({
    country: "ID",
    occurrenceStatus: "PRESENT",
    year: `1990,${endYear}`,
    limit: "0",
    facet: "iucnRedListCategory",
    facetLimit: "20",
  });
  return parseBiodiversity(
    await downloadJson(`https://api.gbif.org/v1/occurrence/search?${q}`),
    endYear,
  );
}

function validGeometry(geometry: any): boolean {
  if (
    !geometry ||
    !["Point", "Polygon", "MultiPolygon"].includes(geometry.type)
  )
    return false;
  let vertices = 0;
  const point = (p: any) =>
    Array.isArray(p) &&
    p.length >= 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    p[0] >= 94 &&
    p[0] <= 142 &&
    p[1] >= -11.5 &&
    p[1] <= 6.5 &&
    ++vertices <= 50_000;
  const ring = (r: any) =>
    Array.isArray(r) &&
    r.length >= 4 &&
    r.every(point) &&
    r[0][0] === r[r.length - 1][0] &&
    r[0][1] === r[r.length - 1][1];
  const polygon = (p: any) => Array.isArray(p) && p.length > 0 && p.every(ring);
  if (geometry.type === "Point") return point(geometry.coordinates);
  return geometry.type === "Polygon"
    ? polygon(geometry.coordinates)
    : Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every(polygon);
}
export function parseContext(input: any, id: string): ContextCollection {
  if (input?.type !== "FeatureCollection" || !Array.isArray(input.features))
    throw new Error("Invalid GeoJSON");
  const features: ContextFeature[] = [];
  let rejected = 0;
  for (const f of input.features.slice(0, 1001)) {
    if (f?.type !== "Feature" || !validGeometry(f.geometry)) {
      rejected++;
      continue;
    }
    const p = f.properties ?? {};
    if (
      id === "bnpb-history" &&
      (!/banjir|longsor/i.test(String(p.eventType ?? "")) ||
        !Number.isFinite(Date.parse(String(p.date ?? ""))))
    ) {
      rejected++;
      continue;
    }
    // Whitelist popup properties; no company claims, URLs, raw records or sensitive wildlife coordinates.
    const properties: ContextFeature["properties"] = { layer: id };
    for (const key of ["name", "eventType", "date"])
      if (typeof p[key] === "string") properties[key] = p[key].slice(0, 250);
    features.push({ type: "Feature", geometry: f.geometry, properties });
  }
  return {
    type: "FeatureCollection",
    features: features.slice(0, 1000),
    rejected,
    truncated: input.features.length > 1000,
  };
}
export async function loadContextFile(
  file: string,
  id: string,
  root: string,
): Promise<ContextCollection> {
  const path = resolve(root, file);
  const base = resolve(root) + sep;
  if (!path.startsWith(base)) throw new Error("File outside context directory");
  if ((await stat(path)).size > 5 * 1024 * 1024)
    throw new Error("Context file too large");
  return parseContext(JSON.parse(await readFile(path, "utf8")), id);
}
export async function loadGfw(
  id: string,
  key: string,
): Promise<ContextCollection> {
  const source = gfwVectors[id];
  if (!source) throw new Error("Unknown GFW dataset");
  // Fixed query, country-limited. No visitor SQL, credentials, or URLs accepted.
  const sql = `SELECT gfw_fid, ST_AsGeoJSON(geom) AS geometry FROM data ${source.where ? `WHERE ${source.where}` : ""} ORDER BY gfw_fid LIMIT 101`;
  const q = new URLSearchParams({ sql });
  const raw = JSON.parse(
    await download(
      `https://data-api.globalforestwatch.org/dataset/${source.dataset}/${source.version}/query/json?${q}`,
      { "x-api-key": key },
    ),
  );
  if (!Array.isArray(raw?.data)) throw new Error("Invalid GFW response");
  const features = raw.data.map((row: any) => {
    try {
      return {
        type: "Feature",
        geometry:
          typeof row.geometry === "string"
            ? JSON.parse(row.geometry)
            : row.geometry,
        properties: {},
      };
    } catch {
      return null;
    }
  });
  const parsed = parseContext(
    { type: "FeatureCollection", features: features.slice(0, 100) },
    id,
  );
  return { ...parsed, truncated: raw.data.length > 100 };
}
