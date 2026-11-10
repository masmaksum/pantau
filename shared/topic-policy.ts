import type { Category, Event } from "./types.js";
import { humanRightsCategory } from "./human-rights.js";

export type ExcludedTopic =
  | "kriminal"
  | "transportasi"
  | "ekonomi"
  | "selebritis";

// Explicit human-rights topics take priority over general-topic exclusions. Whole-word
// matching avoids treating "partisipasi", for example, as a mention of "artis".
const rules: [ExcludedTopic, RegExp][] = [
  [
    "kriminal",
    /\b(kriminal(?:itas)?|kejahatan|pembunuhan|dibunuh|pencurian|mencuri|narkoba|narkotika|ditangkap|perampokan|korupsi|suap|penipuan|penggelapan|pencabulan|pemerkosaan|pelecehan seksual|kekerasan seksual|pengeroyokan|penusukan|penganiayaan|dianiaya|dipukul|dikeroyok|begal|curanmor|tersangka|terdakwa|terpidana|pencucian uang|judi online)\b/iu,
  ],
  [
    "transportasi",
    /\b(transportasi|kecelakaan|kemacetan|macet|lalu lintas|kereta(?: api)?|penerbangan|maskapai|bandara|pelabuhan|angkutan|angkot|transjakarta|transit|commuter|komuter|krl|mrt|lrt|kapal|pesawat|bus|jalan tol|tarif tol|rekayasa lalin|tabrakan|mudik|arus balik)\b/iu,
  ],
  [
    "ekonomi",
    /\b(ekonomi|perekonomian|bisnis|keuangan|finansial|investasi|investor|saham|bursa|ihsg|rupiah|dolar|dollar|inflasi|deflasi|pdb|produk domestik bruto|perbankan|bank|kredit|pinjaman|suku bunga|obligasi|dividen|laba|omzet|ekspor|impor|perdagangan|komoditas|harga|pajak|apbn|apbd|bea cukai|bea masuk|umkm|kripto|bitcoin|cryptocurrency)\b/iu,
  ],
  [
    "selebritis",
    /\b(selebritis|selebritas|seleb|selebgram|artis|aktor|aktris|penyanyi|musisi|influencer|entertainment|showbiz|infotainment|gosip|sinetron|konser|album|single terbaru|film|kpop|k-pop|hollywood|bollywood)\b/iu,
  ],
];

export function excludedTopic(
  title: string,
  summary = "",
  topicHints: string[] = [],
): ExcludedTopic | null {
  if (humanRightsCategory(title, summary)) return null;
  const text = [title, summary, ...topicHints].join(" ").normalize("NFKC");
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function isAllowedReport(
  report: Pick<Event, "title" | "summary" | "category"> & {
    topicHints?: string[];
  },
): boolean {
  return (
    (humanRightsCategory(report.title, report.summary) !== null ||
      !["kriminal", "transportasi"].includes(report.category)) &&
    excludedTopic(report.title, report.summary, report.topicHints) === null
  );
}

// Legacy categories remain readable in old snapshots, but are no longer selectable.
export const visibleCategories: Category[] = [
  "ham-aparat",
  "ham-aktivis",
  "ham-ormas",
  "ham-persekusi",
  "ham-lainnya",
  "gempa",
  "banjir",
  "kebakaran",
  "demo",
  "politik",
  "lainnya",
];

// Reclassify cached reports using their actual text, never trust a category alone
// to bypass exclusions. This also keeps titles/sources and verification unchanged.
export function applyTopicPolicy<
  T extends Pick<Event, "title" | "summary" | "category">,
>(report: T): T {
  const category = humanRightsCategory(report.title, report.summary);
  return category ? { ...report, category } : report;
}
