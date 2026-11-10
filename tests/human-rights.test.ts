import test from "node:test";
import assert from "node:assert/strict";
import { humanRightsCategory } from "../shared/human-rights.js";
import {
  excludedTopic,
  applyTopicPolicy,
  isAllowedReport,
  visibleCategories,
} from "../shared/topic-policy.js";
import { parseFeed } from "../server/providers.js";
import { classify } from "../server/domain.js";

test("route the requested HAM monitoring topics into explicit categories", () => {
  const examples = [
    ["Aparat diduga memukul warga", "ham-aparat"],
    ["Warga dianiaya oleh oknum polisi", "ham-aparat"],
    ["Kekerasan aparat saat membubarkan aksi", "ham-aparat"],
    ["Aktivis lingkungan ditangkap setelah aksi protes", "ham-aktivis"],
    ["Represi terhadap pembela HAM", "ham-aktivis"],
    ["Ormas diduga menganiaya warga sipil", "ham-ormas"],
    ["Kekerasan sipil oleh ormas disorot warga", "ham-ormas"],
    ["Persekusi terhadap kelompok minoritas", "ham-persekusi"],
    ["Penghilangan paksa kembali disorot", "ham-lainnya"],
    ["Laporan dugaan pelanggaran HAM dibantah pejabat", "ham-lainnya"],
  ];
  for (const [title, category] of examples) {
    assert.equal(humanRightsCategory(title), category, title);
    assert.equal(classify(title), category, title);
    assert.equal(visibleCategories.includes(category as any), true);
  }
});

test("rights monitoring overrides generic crime and incidental excluded-topic keywords", () => {
  for (const title of [
    "Aktivis ditangkap saat menolak investasi tambang",
    "Penganiayaan warga oleh aparat di bandara",
    "Jurnalis diserang setelah meliput konser",
    "Persekusi terhadap warga oleh ormas, polisi tetapkan tersangka",
  ])
    assert.equal(excludedTopic(title), null, title);
});

test("routine crime reporting and routine police presence are not upgraded into HAM allegations", () => {
  for (const title of [
    "Polisi menangkap pelaku penganiayaan",
    "Polisi ungkap kasus pembunuhan di Bandung",
    "Korban dianiaya pelaku lalu melapor ke polisi",
    "Mahasiswa ditangkap karena pencurian kendaraan",
  ]) {
    assert.equal(humanRightsCategory(title), null, title);
    assert.equal(excludedTopic(title), "kriminal", title);
  }
  assert.equal(
    humanRightsCategory("Polisi membantu evakuasi korban banjir"),
    null,
  );
});

test("summary can establish monitoring context while preserving reported allegations and source text", () => {
  const title = "Pejabat membantah tuduhan";
  const summary =
    "Aktivis melaporkan dugaan penganiayaan. Bantahan disampaikan dalam konferensi pers.";
  const xml = `<rss><channel><item><title>${title}</title><description>${summary}</description><link>https://example.com/report</link></item></channel></rss>`;
  const report = parseFeed(xml, "Test")[0];
  assert.equal(report.category, "ham-aktivis");
  assert.equal(report.title, title);
  assert.equal(report.summary, summary);
  assert.equal(report.verification, "reported");
  assert.equal(report.source, "Test");
});

test("cached criminal classifications are re-routed by text, but a HAM label alone cannot bypass exclusions", () => {
  const report = {
    title: "Aktivis ditangkap usai demonstrasi",
    summary: "",
    category: "kriminal" as const,
  };
  const updated = applyTopicPolicy(report);
  assert.equal(updated.category, "ham-aktivis");
  assert.equal(isAllowedReport(updated), true);
  assert.equal(report.category, "kriminal");
  assert.equal(
    isAllowedReport({
      title: "IHSG dan rupiah menguat",
      summary: "",
      category: "ham-lainnya",
    }),
    false,
  );
});
