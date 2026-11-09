import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Event, Weather } from "../shared/types.js";
import { excludedTopic } from "../shared/topic-policy.js";
import {
  canonicalUrl,
  classify,
  idFor,
  locate,
  safeUrl,
  textOnly,
} from "./domain.js";
import { download, downloadJson } from "./http.js";

const xml = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
});
const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const isoDate = (raw: unknown) => {
  const n = Date.parse(String(raw ?? ""));
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
};
export const NEWS_FEEDS = [
  {
    id: "antara",
    name: "ANTARA",
    url: "https://www.antaranews.com/rss/terkini.xml",
  },
  { id: "detik", name: "detikNews", url: "https://news.detik.com/berita/rss" },
];
export function parseFeed(
  body: string,
  source: string,
  observedAt = new Date().toISOString(),
): Event[] {
  if (XMLValidator.validate(body) !== true) throw new Error("Invalid XML");
  const data = xml.parse(body);
  const channel = data.rss?.channel;
  const atom = data.feed;
  if (!channel && !atom) throw new Error("Unrecognized feed");
  return array<Record<string, any>>(channel?.item ?? atom?.entry)
    .flatMap((item) => {
      const links = array<any>(item.link);
      const rawLink = links.find(
        (v) =>
          typeof v === "string" || !v["@_rel"] || v["@_rel"] === "alternate",
      );
      const url = safeUrl(
        typeof rawLink === "string" ? rawLink : rawLink?.["@_href"],
      );
      const title = textOnly(item.title?.["#text"] ?? item.title).slice(0, 500);
      if (!url || !title) return [];
      const summary = textOnly(
        item.description ?? item.summary?.["#text"] ?? item.summary ?? "",
      ).slice(0, 600);
      const topicHints = array<any>(item.category).map((category) =>
        textOnly(category?.["#text"] ?? category?.["@_term"] ?? category),
      );
      if (excludedTopic(title, summary, topicHints)) return [];
      return [
        {
          id: idFor(canonicalUrl(url)),
          title,
          summary,
          topicHints,
          url,
          source,
          category: classify(title),
          publishedAt: isoDate(
            item.pubDate ?? item.published ?? item.updated ?? item["dc:date"],
          ),
          observedAt,
          location: locate(title),
          verification: "reported" as const,
        },
      ];
    })
    .slice(0, 100);
}
export const loadFeed = async (url: string, name: string) =>
  parseFeed(await download(url), name);

export const BMKG_URL =
  "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json";
export function parseQuakes(input: unknown): Event[] {
  const d = input as { Infogempa?: { gempa?: any[] | any } };
  if (!d?.Infogempa || !("gempa" in d.Infogempa))
    throw new Error("Invalid BMKG response");
  return array<any>(d.Infogempa.gempa).flatMap((q) => {
    const [lat, lon] = String(q.Coordinates ?? "")
      .split(",")
      .map(Number);
    const magnitude = Number(q.Magnitude);
    const publishedAt = isoDate(q.DateTime);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180 ||
      !Number.isFinite(magnitude) ||
      !publishedAt
    )
      return [];
    return [
      {
        id: idFor(`bmkg:${publishedAt}:${lat}:${lon}`),
        title: `Gempa M${magnitude.toFixed(1)} · ${textOnly(q.Wilayah)}`,
        summary:
          `${textOnly(q.Kedalaman)} · ${textOnly(q.Potensi)} ${textOnly(q.Dirasakan)}`.trim(),
        url: `https://www.bmkg.go.id/gempabumi`,
        source: "BMKG",
        category: "gempa" as const,
        publishedAt,
        observedAt: new Date().toISOString(),
        magnitude,
        depth: textOnly(q.Kedalaman),
        location: {
          name: textOnly(q.Wilayah),
          lat,
          lon,
          precision: "epicenter" as const,
          method: "official" as const,
        },
        verification: "official" as const,
      },
    ];
  });
}
export const loadQuakes = async () => parseQuakes(await downloadJson(BMKG_URL));

// FIRMS fields are unquoted numbers/identifiers; reject malformed rows instead of guessing coordinates.
export function parseFires(csv: string): Event[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  for (const field of [
    "latitude",
    "longitude",
    "acq_date",
    "acq_time",
    "confidence",
  ])
    if (!header.includes(field)) throw new Error("Invalid FIRMS CSV");
  return lines
    .flatMap((line) => {
      const fields = line.split(",");
      if (fields.length !== header.length) return [];
      const row = Object.fromEntries(header.map((k, i) => [k, fields[i]]));
      const lat = Number(row.latitude),
        lon = Number(row.longitude);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -11.5 ||
        lat > 6.5 ||
        lon < 94 ||
        lon > 142
      )
        return [];
      const time = row.acq_time.padStart(4, "0");
      const publishedAt = isoDate(
        `${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`,
      );
      if (!publishedAt) return [];
      return [
        {
          id: idFor(`firms:${lat}:${lon}:${publishedAt}:${row.satellite}`),
          title: `Anomali panas · ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
          summary:
            "Deteksi termal VIIRS, bukan konfirmasi kebakaran di lapangan. Titik mewakili piksel sensor.",
          url: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon},${lat},10z`,
          source: "NASA FIRMS",
          category: "kebakaran" as const,
          publishedAt,
          observedAt: new Date().toISOString(),
          confidence: row.confidence,
          location: {
            name: "Piksel VIIRS",
            lat,
            lon,
            precision: "satellite-pixel" as const,
            method: "satellite" as const,
          },
          verification: "sensor" as const,
        },
      ];
    })
    .slice(0, 2000);
}
export const loadFires = async (key: string) =>
  parseFires(
    await download(
      `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/94,-11.5,142,6.5/1`,
    ),
  );

export async function loadWeather(city: {
  name: string;
  lat: number;
  lon: number;
}): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(city.lat),
    longitude: String(city.lon),
    current: "temperature_2m,precipitation,wind_speed_10m,weather_code",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    forecast_days: "3",
    timezone: "Asia/Jakarta",
  });
  const d: any = await downloadJson(
    `https://api.open-meteo.com/v1/forecast?${params}`,
  );
  if (
    !d.current ||
    !Array.isArray(d.daily?.time) ||
    !Number.isFinite(d.current.temperature_2m)
  )
    throw new Error("Invalid weather");
  return {
    city: city.name,
    latitude: city.lat,
    longitude: city.lon,
    time: `${d.current.time}+07:00`,
    fetchedAt: new Date().toISOString(),
    temperature: d.current.temperature_2m,
    precipitation: d.current.precipitation,
    wind: d.current.wind_speed_10m,
    code: d.current.weather_code,
    daily: d.daily.time.map((date: string, i: number) => ({
      date,
      min: d.daily.temperature_2m_min[i],
      max: d.daily.temperature_2m_max[i],
      rain: d.daily.precipitation_probability_max[i],
    })),
  };
}
