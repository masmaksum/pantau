import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Event, Snapshot } from "../shared/types.js";
import {
  excludedTopic,
  isAllowedReport,
  visibleCategories,
} from "../shared/topic-policy.js";
import { parseFeed } from "../server/providers.js";
import { createApp } from "../server/app.js";

test("exclude all four topics, including synonyms and mixed-category headlines", () => {
  const examples = [
    ["kriminal", "Polisi ungkap kasus pembunuhan di Bandung"],
    ["kriminal", "Presiden bicara pemberantasan korupsi"],
    ["transportasi", "Banjir menyebabkan kemacetan lalu lintas"],
    ["transportasi", "Jadwal penerbangan di bandara berubah"],
    ["ekonomi", "IHSG dan rupiah menguat"],
    ["ekonomi", "Menteri membahas investasi dan perdagangan"],
    ["selebritis", "Aktris mengumumkan kabar pernikahan"],
    ["selebritis", "Artis menggalang bantuan untuk korban banjir"],
  ];
  for (const [topic, title] of examples)
    assert.equal(excludedTopic(title), topic, title);
});

test("keep disaster, demonstration and political reports; do not match word fragments", () => {
  for (const title of [
    "Gempa di pesisir selatan",
    "Banjir di Semarang",
    "Kebakaran hutan meluas",
    "Demonstrasi warga di Jakarta",
    "DPR membahas pemilu",
    "Partisipasi warga dalam mitigasi bencana",
    "Polisi membantu evakuasi warga",
    "Jalan desa terendam banjir",
  ])
    assert.equal(excludedTopic(title), null, title);
});

test("summary and RSS/Atom topic metadata also enforce exclusions", () => {
  assert.equal(
    excludedTopic("Perkembangan terbaru", "Kasus penipuan telah terungkap"),
    "kriminal",
  );
  assert.equal(excludedTopic("Kabar terbaru", "", ["Ekonomi"]), "ekonomi");
  const rss =
    "<rss><channel><item><title>Kabar terbaru</title><link>https://example.com/excluded</link><category>Selebritas</category></item><item><title>Banjir di Bandung</title><link>https://example.com/allowed</link></item></channel></rss>";
  assert.equal(parseFeed(rss, "Test").length, 1);
  assert.equal(parseFeed(rss, "Test")[0].url, "https://example.com/allowed");
  const atom =
    '<feed><entry><title>Kabar terbaru</title><link href="https://example.com/excluded"/><category term="Transportasi"/></entry></feed>';
  assert.deepEqual(parseFeed(atom, "Test"), []);
});

test("legacy excluded categories cannot reappear as generic reports", () => {
  assert.equal(
    isAllowedReport({
      title: "Laporan lama",
      summary: "",
      category: "kriminal",
    }),
    false,
  );
  assert.equal(
    isAllowedReport({
      title: "Laporan lama",
      summary: "",
      category: "transportasi",
    }),
    false,
  );
  assert.equal(visibleCategories.includes("kriminal"), false);
  assert.equal(visibleCategories.includes("transportasi"), false);
});

test("API re-filters persisted pre-policy snapshots and source counts without network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pantau-topic-policy-"));
  const now = new Date().toISOString();
  const make = (
    id: string,
    title: string,
    category: Event["category"] = "lainnya",
  ): Event => ({
    id,
    title,
    category,
    summary: "",
    url: `https://example.com/${id}`,
    source: "ANTARA",
    location: null,
    publishedAt: now,
    observedAt: now,
    verification: "reported",
  });
  const old = [
    make("crime", "Pembunuhan di Jakarta"),
    make("transport", "Kecelakaan di Bandung"),
    make("economy", "Ekonomi Indonesia tumbuh"),
    make("celeb", "Penyanyi merilis kabar terbaru"),
    make("legacy", "Laporan lama", "kriminal"),
    make("allowed", "Banjir di Semarang", "banjir"),
    make(
      "ham-cached",
      "Aktivis lingkungan ditangkap setelah aksi protes",
      "kriminal",
    ),
  ];
  for (const key of ["antara", "detik", "bmkg"])
    await writeFile(
      join(dir, `${key}.json`),
      JSON.stringify({ value: key === "antara" ? old : [], fetchedAt: now }),
    );
  const server = createApp({ cacheDir: dir }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/situation`,
    );
    assert.equal(response.status, 200);
    const snapshot = (await response.json()) as Snapshot;
    assert.deepEqual(
      snapshot.events.map((e) => e.id),
      ["allowed", "ham-cached"],
    );
    assert.equal(snapshot.sources.find((s) => s.id === "antara")?.count, 2);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(dir, { recursive: true, force: true });
  }
});
