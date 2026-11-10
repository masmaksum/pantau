import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { build } from "esbuild";
import { dashboardLayout } from "../src/layout.js";
import { mountNavigation } from "../src/navigation.js";
import { filterReports, newsReports } from "../shared/report-view.js";
import { isCamera } from "../server/config.js";
import type { Event, Snapshot } from "../shared/types.js";

const current = new Date().toISOString();
const report: Event = {
  id: "news-1",
  title: "Banjir di Bandung",
  summary: "Bantuan untuk pengungsi",
  source: "ANTARA",
  url: "https://www.antaranews.com/berita/1/banjir",
  category: "banjir",
  location: {
    name: "Bandung",
    lat: -6.91,
    lon: 107.61,
    precision: "city",
    method: "headline-match",
  },
  publishedAt: current,
  observedAt: current,
  verification: "reported",
};
const snapshot: Snapshot = {
  generatedAt: current,
  events: [
    report,
    {
      ...report,
      id: "news-2",
      title: "Dugaan intimidasi aktivis di Semarang",
      summary: "Pendampingan untuk aktivis",
      source: "detikNews",
      category: "ham-aktivis",
      url: "https://news.detik.com/berita/2",
      location: null,
    },
    {
      ...report,
      id: "quake",
      title: "Gempa M4.0",
      source: "BMKG",
      category: "gempa",
      verification: "official",
    },
    { ...report, id: "social", source: "X", url: "https://x.com/u/status/1" },
  ],
  sources: [
    {
      id: "antara",
      name: "ANTARA",
      url: "https://www.antaranews.com",
      status: "ok",
      count: 1,
      fetchedAt: current,
      attemptedAt: current,
    },
    {
      id: "detik",
      name: "detikNews",
      url: "https://news.detik.com",
      status: "ok",
      count: 1,
      fetchedAt: current,
      attemptedAt: current,
    },
    {
      id: "bmkg",
      name: "BMKG",
      url: "https://www.bmkg.go.id",
      status: "ok",
      count: 1,
      fetchedAt: current,
      attemptedAt: current,
    },
    {
      id: "social-x",
      name: "X",
      url: "https://x.com",
      status: "unconfigured",
      count: 0,
      fetchedAt: null,
      attemptedAt: current,
    },
  ],
};

test("navigation restores archive links, supports keyboard tabs and preserves independent filter inputs", async () => {
  const win = new Window({ url: "http://localhost/#berita/arsip" });
  try {
    win.document.body.innerHTML = dashboardLayout("");
    const visits: string[] = [];
    const nav = mountNavigation(
      (v, n) => visits.push(`${v}/${n}`),
      win.document as unknown as Document,
      win as unknown as globalThis.Window,
    );
    assert.equal(
      win.document
        .querySelector('[data-view-panel="peta"]')!
        .hasAttribute("hidden"),
      true,
    );
    assert.equal(
      win.document
        .querySelector('[data-view="berita"]')!
        .getAttribute("aria-current"),
      "page",
    );
    assert.equal(
      win.document.getElementById("news-archive")!.hasAttribute("hidden"),
      false,
    );
    const search = win.document.getElementById(
      "search",
    ) as unknown as HTMLInputElement;
    search.value = "pengungsi";
    nav.go("peta");
    assert.equal(win.location.hash, "#peta");
    assert.equal(search.value, "pengungsi");
    nav.go("medsos");
    assert.equal(
      win.document.getElementById("view-peta")!.hasAttribute("hidden"),
      true,
    );
    nav.go("berita");
    win.document
      .getElementById("tab-news-live")!
      .dispatchEvent(
        new win.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    assert.equal(win.location.hash, "#berita/arsip");
    assert.equal(win.document.activeElement?.id, "tab-news-archive");
    win.location.hash = "#peta";
    win.dispatchEvent(new win.Event("hashchange"));
    assert.equal(visits.at(-1), "peta/terkini");
    assert.equal(search.value, "pengungsi");
  } finally {
    await win.happyDOM.close();
  }
});

test("news channel excludes sensors/social and independent filters keep map totals separate", () => {
  const news = newsReports(snapshot);
  assert.equal(news.length, 2);
  assert.equal(
    filterReports(news, { hours: 24, search: "pengungsi", source: "ANTARA" })
      .length,
    1,
  );
  assert.equal(
    filterReports(snapshot.events, { hours: 24, category: "gempa" }).length,
    1,
  );
  assert.equal(filterReports(news, { hours: 24, category: "gempa" }).length, 0);
  assert.equal(filterReports(news, { hours: 24, region: "Bandung" }).length, 1);
  assert.equal(filterReports(news, { hours: 24, located: true }).length, 1);
  assert.equal(
    filterReports(
      [
        { ...report, publishedAt: null },
        { ...report, publishedAt: "2020-01-01T00:00:00Z" },
        { ...report, title: "IHSG menguat", summary: "", category: "lainnya" },
      ],
      { hours: 72 },
    ).length,
    0,
  );
});

test("CCTV coordinates are optional, explicitly supplied and bounded", () => {
  const camera = {
    id: "test",
    name: "Kamera uji",
    region: "Bandung",
    type: "link",
    url: "https://camera.example/view",
    sourceUrl: "https://camera.example",
  };
  assert.equal(isCamera(camera), true);
  assert.equal(
    isCamera({ ...camera, location: { lat: -6.91, lon: 107.61 } }),
    true,
  );
  for (const location of [
    null,
    {},
    { lat: NaN, lon: 107 },
    { lat: 100, lon: 107 },
    { lat: -7, lon: 190 },
    { lat: "-7", lon: 107 },
  ])
    assert.equal(isCamera({ ...camera, location }), false);
});

test("dashboard initializes in a DOM, switches all views, isolates map/news filters and opens CCTV", async () => {
  const bundle = await build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    loader: { ".css": "empty" },
    logLevel: "silent",
  });
  const win = new Window({
    url: "http://localhost/",
    settings: {
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
    },
  });
  const requests: string[] = [];
  win.document.body.innerHTML = '<div id="app"></div>';
  const response = (value: unknown) =>
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  win.fetch = (async (path: unknown) => {
    const url = String(path);
    requests.push(url);
    if (url.startsWith("/api/situation")) return response(snapshot);
    if (url === "/api/cities") return response([{ name: "jakarta" }]);
    if (url.startsWith("/api/weather"))
      return response({ value: null, status: "error" });
    if (url === "/api/cameras")
      return response({
        cameras: [
          {
            id: "cam",
            name: "Kamera tanpa koordinat",
            region: "Bandung",
            type: "link",
            url: "https://camera.example/view",
            sourceUrl: "https://camera.example",
          },
          {
            id: "located",
            name: "Kamera berkoordinat",
            region: "Bandung",
            type: "link",
            url: "https://camera.example/view2",
            sourceUrl: "https://camera.example",
            location: { lat: -6.91, lon: 107.61 },
          },
        ],
        status: "configured",
        message: "Akses diperiksa saat dibuka",
      });
    if (url === "/api/social/providers")
      return response({
        providers: [
          {
            platform: "x",
            name: "X",
            stage: "configuration_missing",
            scope: "API resmi",
            message: "Belum mengambil data",
            documentation: "https://docs.x.com",
          },
        ],
      });
    if (url === "/api/archive/status")
      return response({
        articles: 0,
        revisions: 0,
        sources: [],
        categories: [],
        status: "ok",
      });
    if (url.startsWith("/api/archive?"))
      return response({ items: [], total: 0, offset: 0, limit: 25 });
    if (url === "/api/environment/catalog") return response({ datasets: [] });
    return response({ value: null, status: "unconfigured", datasets: [] });
  }) as unknown as typeof win.fetch;
  const until = async (check: () => boolean) => {
    for (let n = 0; n < 100; n++) {
      if (check()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail("DOM did not settle");
  };
  try {
    win.eval(bundle.outputFiles[0].text);
    await until(
      () =>
        win.document.getElementById("wire-count")?.textContent === "2 berita",
    );
    assert.equal(win.document.getElementById("count-events")!.textContent, "4");
    const search = win.document.getElementById(
      "search",
    ) as unknown as HTMLInputElement;
    search.value = "pengungsi";
    search.dispatchEvent(new win.Event("input") as unknown as globalThis.Event);
    assert.equal(
      win.document.getElementById("wire-count")!.textContent,
      "1 berita",
    );
    assert.equal(win.document.getElementById("count-events")!.textContent, "4");
    (
      win.document.querySelector(
        '[data-view="berita"]',
      ) as unknown as HTMLAnchorElement
    ).click();
    assert.equal(
      win.document.getElementById("view-peta")!.hasAttribute("hidden"),
      true,
    );
    (
      win.document.getElementById(
        "tab-news-archive",
      ) as unknown as HTMLButtonElement
    ).click();
    await until(() => requests.some((p) => p.startsWith("/api/archive?")));
    await until(
      () =>
        win.document.getElementById("archive-page")?.textContent ===
        "0–0 / 0 berita",
    );
    assert.equal(
      win.document.getElementById("news-archive")!.hasAttribute("hidden"),
      false,
    );
    (
      win.document.querySelector(
        '[data-view="medsos"]',
      ) as unknown as HTMLAnchorElement
    ).click();
    assert.equal(
      win.document.getElementById("view-berita")!.hasAttribute("hidden"),
      true,
    );
    (
      win.document.querySelector(
        '[data-view="peta"]',
      ) as unknown as HTMLAnchorElement
    ).click();
    await until(() =>
      win.document
        .getElementById("camera-count")!
        .textContent!.includes("2 kamera"),
    );
    (
      win.document.getElementById("open-cctv") as unknown as HTMLButtonElement
    ).click();
    assert.equal(
      (
        win.document.getElementById(
          "cctv-panel",
        ) as unknown as HTMLDetailsElement
      ).open,
      true,
    );
    assert.equal(
      win.document.getElementById("camera-count")!.textContent,
      "2 kamera · 1 berkoordinat",
    );
    const toggle = win.document.getElementById(
      "cctv-map-toggle",
    ) as unknown as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(
      new win.Event("change") as unknown as globalThis.Event,
    );
    assert.equal(win.document.querySelectorAll(".cctv-pin").length, 1);
    assert.ok(
      !requests.some((p) => p.includes("camera.example")),
      "CCTV never opens before explicit user action",
    );
    assert.ok(!win.document.querySelector(".topbar"));
    assert.equal(win.document.querySelectorAll("[data-view]").length, 3);
  } finally {
    await win.happyDOM.close();
  }
});
