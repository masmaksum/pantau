import type { Category, Event } from "./types.js";

export type ExcludedTopic =
  | "kriminal"
  | "transportasi"
  | "ekonomi"
  | "selebritis";

// Exclusions precede classification, including mixed-topic reports. Whole-word
// matching avoids treating "partisipasi", for example, as a mention of "artis".
const rules: [ExcludedTopic, RegExp][] = [
  [
    "kriminal",
    /\b(kriminal(?:itas)?|kejahatan|pembunuhan|pencurian|mencuri|narkoba|narkotika|ditangkap|perampokan|korupsi|suap|penipuan|penggelapan|pencabulan|pemerkosaan|pelecehan seksual|kekerasan seksual|pengeroyokan|penusukan|penganiayaan|begal|curanmor|tersangka|terdakwa|terpidana|pencucian uang|judi online)\b/iu,
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
  const text = [title, summary, ...topicHints].join(" ").normalize("NFKC");
  return rules.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

export function isAllowedReport(
  report: Pick<Event, "title" | "summary" | "category"> & {
    topicHints?: string[];
  },
): boolean {
  return (
    !["kriminal", "transportasi"].includes(report.category) &&
    excludedTopic(report.title, report.summary, report.topicHints) === null
  );
}

// Legacy categories remain readable in old snapshots, but are no longer selectable.
export const visibleCategories: Category[] = [
  "gempa",
  "banjir",
  "kebakaran",
  "demo",
  "politik",
  "lainnya",
];
