export type HumanRightsCategory =
  | "ham-aparat"
  | "ham-aktivis"
  | "ham-ormas"
  | "ham-persekusi"
  | "ham-lainnya";

const official = "(?:aparat|polisi|polri|tni|tentara|brimob|satpol\\s+pp)";
const organization = "(?:ormas|organisasi\\s+kemasyarakatan)";
const activeViolence =
  "(?:menganiaya|aniaya|memukul|pukul|menembak|tembak|menyiksa|siksa|mengintimidasi|intimidasi|menyerang|serang|mengeroyok|keroyok|mengancam|ancam|membubarkan\\s+paksa|melakukan\\s+kekerasan)";
const passiveViolence =
  "(?:penganiayaan|pemukulan|penyiksaan|dianiaya|dipukul|ditembak|disiksa|diintimidasi|diserang|dikeroyok|diancam|dipersekusi)";
const bridge = "(?:\\s+[\\p{L}\\p{N}-]+){0,5}\\s+";
const officialBridge =
  "(?:\\s+(?:diduga|dilaporkan|kedapatan|terekam|kembali|justru|malah|telah|disebut|oknum|anggota|membantah|bantah|dugaan)){0,4}\\s+";
const direct = (actor: string, gap = bridge) =>
  new RegExp(
    `\\b(?:${actor}${gap}${activeViolence}|${passiveViolence}\\s+(?:oleh\\s+)?(?:(?:oknum|anggota|sejumlah|sekelompok|massa)\\s+){0,2}${actor})\\b`,
    "iu",
  );
const actorViolence = direct(official, officialBridge),
  ormasViolence = direct(organization);

/** Topic routing only, not a legal finding or factual verification of an allegation. */
export function humanRightsCategory(
  title: string,
  summary = "",
): HumanRightsCategory | null {
  const text = `${title} ${summary}`.normalize("NFKC");
  const activist =
    /\b(aktivis|pegiat|pembela ham|pembela lingkungan|pembela hak|jurnalis|wartawan|masyarakat adat|warga adat|serikat pekerja)\b/iu.test(
      text,
    ) ||
    (/\b(mahasiswa|buruh|warga)\b/iu.test(text) &&
      /\b(demo|demonstrasi|unjuk rasa|aksi protes|berserikat|kebebasan berpendapat)\b/iu.test(
        text,
      ));
  const repression =
    /\b(represi|represif|kriminalisasi|dikriminalisasi|intimidasi|diintimidasi|teror|diteror|dibungkam|pembungkaman|ditangkap|penangkapan|ditahan|penahanan|diculik|penculikan|dipukul|pemukulan|diserang|penyerangan|dianiaya|penganiayaan|dibunuh|pembunuhan|diancam|ancaman|doxing|doxxing|peretasan|pembubaran paksa|kekerasan|penggusuran paksa)\b/iu.test(
      text,
    );
  if (activist && repression) return "ham-aktivis";
  if (
    /\b(persekusi|dipersekusi|intoleransi|pelarangan ibadah|pembubaran ibadah|penyerangan rumah ibadah|penutupan rumah ibadah|pengusiran jemaat)\b/iu.test(
      text,
    )
  )
    return "ham-persekusi";
  if (
    ormasViolence.test(text) ||
    /\b(kekerasan|pengeroyokan|penyerangan|persekusi)\b.{0,45}\b(?:oleh|anggota|massa)\s+ormas\b/iu.test(
      text,
    )
  )
    return "ham-ormas";
  if (
    actorViolence.test(text) ||
    new RegExp(
      `\\b(?:penganiayaan|pemukulan|penembakan|penyiksaan)\\s+(?:warga|sipil|masyarakat|tahanan|demonstran)\\s+oleh\\s+(?:oknum\\s+)?${official}\\b`,
      "iu",
    ).test(text) ||
    /\b(kekerasan|brutalitas|represi)\s+(?:oleh\s+)?(?:aparat|polisi|polri|tni|tentara|brimob|satpol pp)\b/iu.test(
      text,
    ) ||
    (new RegExp(`\\b${official}\\b`, "iu").test(text) &&
      /\b(demonstran|pengunjuk rasa|peserta aksi)\b/iu.test(text) &&
      /\b(kekerasan|gas air mata|peluru karet|pemukulan|penembakan|dibubarkan paksa)\b/iu.test(
        text,
      ))
  )
    return "ham-aparat";
  if (
    /\b(pelanggaran ham|pelanggaran hak asasi|hak asasi manusia|penghilangan paksa|dihilangkan paksa|penahanan sewenang-wenang|penangkapan sewenang-wenang|penyiksaan tahanan|tahanan disiksa|diskriminasi rasial|diskriminasi agama|diskriminasi etnis|penggusuran paksa|kebebasan pers|kebebasan berpendapat|kebebasan beragama|kebebasan berserikat)\b/iu.test(
      text,
    )
  )
    return "ham-lainnya";
  return null;
}
