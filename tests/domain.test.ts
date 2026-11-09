import test from "node:test";
import assert from "node:assert/strict";
import {
  classify,
  locate,
  safeUrl,
  deduplicate,
  withinHours,
} from "../server/domain.js";
import { parseFeed, parseFires, parseQuakes } from "../server/providers.js";
import type { Event } from "../shared/types.js";

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "a",
  title: "Laporan",
  summary: "",
  url: "https://news.example/a",
  source: "Test",
  category: "lainnya",
  location: null,
  publishedAt: "2026-11-10T00:00:00Z",
  observedAt: "2026-11-10T00:01:00Z",
  verification: "reported",
  ...overrides,
});
test("headline locations are approximate and matched at word boundaries", () => {
  assert.equal(locate("Banjir di Bandung")?.precision, "city");
  assert.equal(locate("Banjir di Jawa Barat")?.precision, "province");
  assert.equal(locate("Warga membandingkan hasil"), null);
});
test("multi-location and unknown headlines do not acquire invented coordinates", () => {
  assert.equal(locate("Rute Jakarta ke Bandung terdampak"), null);
  assert.equal(locate("Kebakaran di Desa Contoh"), null);
});
test("category classifier uses explicit incident terms", () => {
  assert.equal(classify("Gempa bumi di pesisir"), "gempa");
  assert.equal(classify("Demo buruh di Jakarta"), "demo");
  assert.equal(classify("Demografi penduduk"), "lainnya");
  assert.equal(classify("Banjir di Semarang"), "banjir");
});
test("publisher duplicate URLs ignore tracking, but different URLs remain separate", () => {
  assert.equal(
    deduplicate([
      event(),
      event({ id: "b", url: "https://news.example/a?utm_source=social#story" }),
    ]).length,
    1,
  );
  assert.equal(
    deduplicate([event(), event({ id: "b", url: "https://other.example/a" })])
      .length,
    2,
  );
});
test("quakes sharing the BMKG landing URL remain distinct events", () => {
  assert.equal(
    deduplicate([
      event({ id: "q1", verification: "official" }),
      event({ id: "q2", verification: "official" }),
    ]).length,
    2,
  );
});
test("date window rejects old, missing and implausibly future dates", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  assert.equal(withinHours(event(), 24, now), true);
  assert.equal(withinHours(event(), 6, now), false);
  assert.equal(withinHours(event({ publishedAt: null }), 24, now), false);
  assert.equal(
    withinHours(event({ publishedAt: "2026-11-11T00:00:00Z" }), 24, now),
    false,
  );
});
test("links reject executable schemes and embedded credentials", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://user:pass@example.com"), null);
  assert.equal(safeUrl("https://example.com"), "https://example.com/");
});
test("RSS parsing retains provenance, sanitizes markup, and does not invent dates", () => {
  const events = parseFeed(
    "<rss><channel><item><title>Banjir di Bandung</title><link>https://news.example/1</link><description><![CDATA[<b>Air</b> naik]]></description><pubDate>Tue, 10 Nov 2026 07:00:00 +0700</pubDate></item><item><title>Tanpa waktu</title><link>https://news.example/2</link></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>",
    "Publisher",
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, "Air naik");
  assert.equal(events[0].publishedAt, "2026-11-10T00:00:00.000Z");
  assert.equal(events[0].source, "Publisher");
  assert.equal(events[0].verification, "reported");
  assert.equal(events[1].publishedAt, null);
});
test("Atom feeds choose alternate links and detect a changed source schema", () => {
  const events = parseFeed(
    '<feed><entry><title>Berita</title><link rel="self" href="https://example.com/api"/><link rel="alternate" href="https://example.com/article"/><updated>2026-11-10T00:00:00Z</updated></entry></feed>',
    "Atom",
  );
  assert.equal(events[0].url, "https://example.com/article");
  assert.throws(() => parseFeed("<html>Access denied</html>", "Broken"));
  assert.throws(() => parseFeed("<rss><channel>", "Broken"));
});
test("BMKG parser preserves official precision and rejects invalid coordinates", () => {
  const data = {
    Infogempa: {
      gempa: [
        {
          DateTime: "2026-11-10T00:00:00Z",
          Coordinates: "-6.2,106.8",
          Magnitude: "5.4",
          Wilayah: "Test",
          Kedalaman: "10 km",
          Potensi: "Tidak berpotensi tsunami",
        },
        {
          DateTime: "2026-11-10T00:00:00Z",
          Coordinates: "999,106",
          Magnitude: "5",
        },
      ],
    },
  };
  const events = parseQuakes(data);
  assert.equal(events.length, 1);
  assert.equal(events[0].location?.precision, "epicenter");
  assert.equal(events[0].magnitude, 5.4);
  assert.throws(() => parseQuakes({ message: "blocked" }));
});
test("FIRMS parses acquisition UTC, bounds region and labels unconfirmed detections", () => {
  const events = parseFires(
    "latitude,longitude,acq_date,acq_time,confidence,satellite\n-2,110,2026-11-10,0350,n,N\n40,-120,2026-11-10,0350,h,N",
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].publishedAt, "2026-11-10T03:50:00.000Z");
  assert.equal(events[0].verification, "sensor");
  assert.equal(events[0].location?.precision, "satellite-pixel");
  assert.throws(() => parseFires("error,invalid key"));
});
