import { createHash } from "node:crypto";
import type { Category, Event, Location } from "../shared/types.js";
import { humanRightsCategory } from "../shared/human-rights.js";

// Small, explicit gazetteer. Never silently promote a city/province match to an exact site.
export const places = [
  ["jakarta", -6.2, 106.82, "city"],
  ["bogor", -6.59, 106.8, "city"],
  ["depok", -6.4, 106.82, "city"],
  ["tangerang", -6.18, 106.63, "city"],
  ["bekasi", -6.24, 106.99, "city"],
  ["bandung", -6.91, 107.61, "city"],
  ["semarang", -6.97, 110.42, "city"],
  ["yogyakarta", -7.8, 110.37, "city"],
  ["surabaya", -7.25, 112.75, "city"],
  ["malang", -7.98, 112.63, "city"],
  ["denpasar", -8.65, 115.22, "city"],
  ["medan", 3.59, 98.67, "city"],
  ["banda aceh", 5.55, 95.32, "city"],
  ["padang", -0.95, 100.35, "city"],
  ["pekanbaru", 0.51, 101.45, "city"],
  ["palembang", -2.99, 104.76, "city"],
  ["jambi", -1.61, 103.61, "city"],
  ["bengkulu", -3.79, 102.26, "city"],
  ["bandar lampung", -5.43, 105.26, "city"],
  ["pontianak", -0.03, 109.34, "city"],
  ["palangka raya", -2.21, 113.92, "city"],
  ["banjarmasin", -3.32, 114.59, "city"],
  ["samarinda", -0.5, 117.15, "city"],
  ["balikpapan", -1.24, 116.85, "city"],
  ["makassar", -5.15, 119.43, "city"],
  ["manado", 1.47, 124.84, "city"],
  ["palu", -0.9, 119.87, "city"],
  ["kendari", -3.99, 122.51, "city"],
  ["gorontalo", 0.54, 123.06, "city"],
  ["mataram", -8.58, 116.12, "city"],
  ["kupang", -10.18, 123.61, "city"],
  ["ambon", -3.7, 128.18, "city"],
  ["ternate", 0.79, 127.38, "city"],
  ["jayapura", -2.53, 140.72, "city"],
  ["sorong", -0.88, 131.25, "city"],
  ["manokwari", -0.86, 134.06, "city"],
  ["jawa barat", -6.9, 107.6, "province"],
  ["jawa tengah", -7.15, 110.14, "province"],
  ["jawa timur", -7.54, 112.24, "province"],
  ["sumatera utara", 2.11, 99.55, "province"],
  ["sumatera barat", -0.74, 100.8, "province"],
  ["sumatera selatan", -3.32, 104, "province"],
  ["kalimantan barat", -0.28, 111.48, "province"],
  ["kalimantan tengah", -1.68, 113.38, "province"],
  ["kalimantan timur", 0.54, 116.42, "province"],
  ["sulawesi selatan", -3.67, 119.97, "province"],
  ["riau", 0.29, 101.7, "province"],
  ["bali", -8.34, 115.09, "province"],
] as const;

export function locate(title: string): Location | null {
  const text = title.toLocaleLowerCase("id");
  // Ambiguous titles (more than one place) stay unlocated, rather than inventing a point.
  const hits = places.filter(([name]) =>
    new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(text),
  );
  if (hits.length !== 1) return null;
  const [name, lat, lon, precision] = hits[0];
  return {
    name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
    lat,
    lon,
    precision,
    method: "headline-match",
  };
}
export function classify(text: string): Category {
  const ham = humanRightsCategory(text);
  if (ham) return ham;
  const rules: [Category, RegExp][] = [
    ["gempa", /\bgempa(?:bumi)?\b/i],
    ["banjir", /\b(banjir|longsor)\b/i],
    ["kebakaran", /\b(kebakaran|karhutla|hotspot)\b/i],
    ["demo", /\b(demonstrasi|unjuk rasa|demo|aksi massa)\b/i],
    [
      "kriminal",
      /\b(pembunuhan|pencurian|narkoba|ditangkap|perampokan|korupsi)\b/i,
    ],
    [
      "transportasi",
      /\b(kecelakaan|kemacetan|lalu lintas|kereta|penerbangan)\b/i,
    ],
    ["politik", /\b(pemilu|pilkada|dpr|menteri|presiden|partai)\b/i],
  ];
  return rules.find(([, re]) => re.test(text))?.[0] ?? "lainnya";
}
export const idFor = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 20);
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function canonicalUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^(utm_|fbclid$|gclid$)/.test(key)) u.searchParams.delete(key);
  return u.href;
}
export function textOnly(value: unknown): string {
  const s =
    typeof value === "string"
      ? value
      : typeof value === "number"
        ? String(value)
        : "";
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function deduplicate(events: Event[]): Event[] {
  // Merge duplicate publisher URLs only; similar headlines are not independent verification.
  const found = new Map<string, Event>();
  for (const event of events) {
    const key =
      event.verification === "reported" ? canonicalUrl(event.url) : event.id;
    if (!found.has(key)) found.set(key, event);
  }
  return [...found.values()].sort(
    (a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""),
  );
}
export function withinHours(event: Event, hours: number, now = Date.now()) {
  const timestamp = Date.parse(event.publishedAt ?? "");
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + 5 * 60_000 &&
    timestamp >= now - hours * 3_600_000
  );
}
