import L from "leaflet";
import { mountNewsArchive } from "./archive-ui.js";
import { mountEnvironment } from "./environment-ui.js";
import { mountOfficialSocial } from "./social-ui.js";
import type Hls from "hls.js";
import {
  isAllowedReport,
  visibleCategories,
  applyTopicPolicy,
} from "../shared/topic-policy.js";
import "leaflet/dist/leaflet.css";
import "./style.css";
import type {
  Camera,
  Category,
  Event,
  Snapshot,
  Weather,
} from "../shared/types.js";

const labels: Record<Category, string> = {
  "ham-aparat": "HAM · Kekerasan aparat",
  "ham-aktivis": "HAM · Represi aktivis",
  "ham-ormas": "HAM · Kekerasan ormas",
  "ham-persekusi": "HAM · Persekusi",
  "ham-lainnya": "HAM · Hak asasi lainnya",
  gempa: "Gempa",
  banjir: "Banjir / longsor",
  kebakaran: "Kebakaran",
  demo: "Demonstrasi",
  kriminal: "Kriminal",
  politik: "Politik",
  transportasi: "Transportasi",
  lainnya: "Lainnya",
};
const colors: Record<Category, string> = {
  "ham-aparat": "#f1a1bd",
  "ham-aktivis": "#f1a1bd",
  "ham-ormas": "#f1a1bd",
  "ham-persekusi": "#f1a1bd",
  "ham-lainnya": "#f1a1bd",
  gempa: "#eea761",
  banjir: "#65b9dd",
  kebakaran: "#ed7964",
  demo: "#bb9cdb",
  kriminal: "#dc8fba",
  politik: "#b9bf8b",
  transportasi: "#74c5b7",
  lainnya: "#a0aca1",
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmtTime = (raw: string | null) =>
  raw
    ? new Intl.DateTimeFormat("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(raw)) + " WIB"
    : "Waktu tidak tersedia";
const age = (raw: string | null) => {
  if (!raw) return "tanpa waktu";
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(raw)) / 60_000));
  return min < 1
    ? "baru saja"
    : min < 60
      ? `${min} menit`
      : `${Math.floor(min / 60)} jam`;
};

document.querySelector("#app")!.innerHTML = `
<header class="masthead">
  <a class="wordmark" href="/" aria-label="PANTAU beranda"><span class="brand-symbol">◉</span> PANTAU<span class="brand-dot">.</span></a>
  <div class="brand-note">RUANG PANTAU INDONESIA<span>Informasi terbuka, dalam konteks.</span></div>
  <div class="header-right"><span class="edition">EDISI 001 / OPEN INTELLIGENCE</span><time id="clock"></time><button id="access" class="icon-button" title="Atur koneksi API" aria-label="Atur koneksi API">⚙</button></div>
</header>
<nav class="topbar" aria-label="Navigasi utama"><div class="tab active">01 <span>Situasi nasional</span></div><a class="tab" href="#channels">02 <span>Kanal & sumber</span></a><div class="topbar-end"><span class="pulse"></span><span id="sync-label">MENGAMBIL DATA</span><button id="refresh" class="text-button">↻ Sinkronkan</button></div></nav>
<main>
  <section class="intro"><div><div class="eyebrow">KEWASPADAAN SITUASIONAL / SUMBER TERBUKA</div><h1>Indonesia, dalam satu pandangan.</h1><p>Ikuti kejadian. Pahami lokasinya. Telusuri sumbernya.</p></div><div class="intro-stamp"><span>WILAYAH PEMANTAUAN</span><strong>94°—142° BT</strong><small>6° LU — 11° LS</small></div></section>
  <div id="notice" class="notice" role="status" hidden></div>
  <section class="dashboard" aria-label="Dashboard situasi">
    <aside class="sidebar">
      <div class="panel-title"><span>01 / IKHTISAR</span><span class="small-tag">INDONESIA</span></div>
      <div class="metrics"><div><strong id="count-events">—</strong><span>Laporan</span></div><div><strong id="count-located">—</strong><span>Dengan lokasi</span></div><div><strong id="count-sources">—</strong><span>Sumber aktif</span></div><div><strong id="count-regions">—</strong><span>Lokasi berbeda</span></div></div>
      <p class="metric-note">Kriminal umum, transportasi, ekonomi, dan selebritis dikecualikan. Laporan HAM diprioritaskan.</p>
      <div class="side-section"><div class="panel-title"><span>CUACA LOKAL</span><span class="small-tag">MODEL</span></div><label class="sr-only" for="city">Kota cuaca</label><select id="city"><option value="jakarta">Jakarta</option></select><div id="weather" class="weather"><p class="muted">Mengambil prakiraan…</p></div></div>
      <div class="side-section source-section"><div class="panel-title"><span>KESEHATAN SUMBER</span><span id="health-count">—</span></div><div id="sources"><p class="muted">Menghubungkan sumber…</p></div></div>
      <div class="side-foot"><span class="compass">↗</span><p>Data membantu orientasi.<br>Konfirmasi sebelum bertindak.</p></div>
    </aside>
    <section class="map-panel" aria-label="Peta kejadian">
      <div class="map-top"><div><span class="eyebrow">02 / PETA SITUASI</span><h2>Sinyal di lapangan <span id="map-count">—</span></h2></div><button id="reset-map" class="outline-button">↗ Indonesia</button></div>
      <div class="map-wrap"><div id="map"></div><div class="map-caption">PETA INTERAKTIF <span>GESER · PERBESAR · PILIH TITIK</span></div><div class="map-empty" id="map-empty" hidden>Tidak ada titik untuk filter ini.</div></div>
      <div class="map-legend"><span><i style="background:#f1a1bd"></i>HAM</span><span><i style="background:#eea761"></i>Gempa</span><span><i style="background:#65b9dd"></i>Banjir</span><span><i style="background:#ed7964"></i>Kebakaran</span><span><i style="background:#bb9cdb"></i>Demo</span><span><i style="background:#a0aca1"></i>Lainnya</span></div>
      <div class="map-disclaimer"><span>⌖</span><p>Pin berita adalah perkiraan pusat wilayah dari judul. Episentrum dan piksel satelit diberi label tersendiri. Area tanpa titik belum tentu bebas kejadian.</p></div>
    </section>
    <section class="wire-panel" aria-label="Daftar laporan">
      <div class="panel-title wire-heading"><span>03 / LAPORAN TERBARU</span><span id="wire-count">—</span></div>
      <div class="wire-controls"><label class="search"><span>⌕</span><input id="search" type="search" placeholder="Cari kejadian, kota, sumber…" aria-label="Cari laporan" /></label><div class="filter-row"><select id="category" aria-label="Kategori"><option value="all">Semua kategori</option>${visibleCategories
        .map((k) => `<option value="${k}">${labels[k]}</option>`)
        .join(
          "",
        )}</select><select id="hours" aria-label="Rentang waktu"><option value="6">6 jam</option><option value="24" selected>24 jam</option><option value="72">72 jam</option></select></div><label class="checkbox"><input type="checkbox" id="located-only" /> Hanya laporan dengan lokasi</label></div>
      <div id="events" class="event-list" aria-live="polite"><div class="loading"><span class="loader"></span>Menghubungkan laporan…</div></div>
      <div class="wire-footer"><span id="updated">Belum tersinkron</span><button id="export" class="text-button">↓ GeoJSON</button></div>
    </section>
  </section>
  <section class="channels" id="channels"><div class="channel-intro"><div class="eyebrow">04 / KANAL TAMBAHAN</div><h2>Konteks yang lebih dekat.</h2><p>Sumber tambahan untuk melengkapi gambaran situasi.</p></div><article class="channel-card"><div class="panel-title"><span>CCTV REGIONAL</span><span class="small-tag" id="camera-count">KONFIGURASI</span></div><h3>Lihat langsung dari sumber.</h3><div id="cameras"><p class="muted">Memeriksa konfigurasi kamera…</p></div></article><article class="channel-card"><div class="panel-title"><span>TRANSPARANSI DATA</span><span class="small-tag">TERBUKA</span></div><h3>Setiap sinyal punya asal.</h3><p>Berita dari RSS penerbit. Gempa dari BMKG. Cuaca dari Open-Meteo. Hotspot opsional dari NASA FIRMS.</p><p class="muted">Kanal X, Threads, Instagram, Facebook, dan TikTok disiapkan melalui API resmi; seluruh kanal belum mengambil data.</p><button id="show-method" class="text-button">Baca cara kerja ↗</button></article></section>
  <footer><span class="footer-brand">PANTAU<span> / </span>BUILT FOR CONTEXT.</span><span>Pembaruan 120 detik · Waktu WIB · Implementasi mandiri</span></footer>
</main>
<dialog id="detail"><button class="dialog-close" data-close="detail" aria-label="Tutup detail">×</button><div id="detail-content"></div></dialog>
<dialog id="method"><button class="dialog-close" data-close="method" aria-label="Tutup cara kerja">×</button><div class="eyebrow">METODE & KETERBATASAN</div><h2>Dari sumber ke situasi.</h2><p>PANTAU membaca RSS dan API sumber, menyeragamkan laporan, lalu mengelompokkannya memakai kata kunci. Kategori bersifat heuristik, bukan penilaian AI atau verifikasi fakta.</p><p>Kriminal umum, transportasi, ekonomi, dan selebritis dikecualikan berdasarkan judul, ringkasan, serta kategori RSS/Atom. Laporan tentang kekerasan aparat, represi aktivis, kekerasan ormas, persekusi, dan hak asasi lainnya diprioritaskan meskipun memuat istilah topik yang dikecualikan. Label HAM adalah klasifikasi topik, bukan temuan hukum; dugaan dan bantahan tetap mengikuti sumber. Penyaringan berbasis kata kunci masih dapat keliru.</p><p>Lokasi berita hanya dicari dalam judul menggunakan daftar kota/provinsi terbatas. Judul dengan beberapa lokasi atau lokasi yang tidak dikenali tidak dipasangkan ke peta. Titik adalah pusat wilayah perkiraan, bukan alamat kejadian.</p><p>Laporan dengan URL penerbit yang sama digabung. Dua URL atau judul serupa tidak otomatis berarti dua kejadian, maupun dua konfirmasi independen. Waktu filter menggunakan waktu publikasi; waktu kejadian bisa berbeda.</p><p>Cache terakhir tetap tersedia saat sumber gagal dan ditandai “data lama”. Waktu pengambilan tercantum di tiap sumber. Hotspot adalah anomali panas, bukan konfirmasi kebakaran. Cuaca adalah keluaran model.</p><p>Collector dan koneksi akun media sosial melalui API resmi belum diaktifkan. Fitur pasar, AIS, ADS-B, MAGMA, pembaca artikel lengkap, dan analisis AI belum tersedia.</p></dialog>
<dialog id="connection"><button class="dialog-close" data-close="connection" aria-label="Tutup pengaturan">×</button><div class="eyebrow">KONEKSI</div><h2>Token akses instans</h2><p>Isi hanya bila operator mengaktifkan PANTAU_API_TOKEN. Token disimpan pada sesi tab ini.</p><form id="token-form"><input type="password" id="api-token" placeholder="Token akses" aria-label="Token akses" autocomplete="off" /><button class="solid-button" type="submit">Simpan & hubungkan</button></form></dialog>
<dialog id="camera-dialog"><button class="dialog-close" data-close="camera-dialog" aria-label="Tutup kamera">×</button><h2 id="camera-name"></h2><video id="camera-video" controls playsinline></video><p id="camera-message" role="status"></p></dialog>
<div id="toast" role="status" hidden></div>`;

const map = L.map("map", {
  center: [-2.5, 118],
  zoom: 4,
  zoomControl: false,
  minZoom: 3,
  maxZoom: 18,
});
L.control.zoom({ position: "bottomright" }).addTo(map);
const dark = L.layerGroup([
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        "Basemap: &copy; Esri, HERE, Garmin, OpenStreetMap contributors",
      maxNativeZoom: 16,
      maxZoom: 18,
    },
  ),
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    {
      pane: "overlayPane",
      maxNativeZoom: 16,
      maxZoom: 18,
    },
  ),
]).addTo(map);
const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
});
L.control
  .layers(
    { "Gelap · Esri": dark, "Jalan · OSM": street },
    {},
    { position: "topright" },
  )
  .addTo(map);
const environment = mountEnvironment(map, api, fmtTime);
const officialSocial = mountOfficialSocial(api);
mountNewsArchive(api, fmtTime, labels, map);
const markers = L.layerGroup().addTo(map);
const markerIndex = new Map<string, L.CircleMarker>();
let snapshot: Snapshot | null = null;
let filtered: Event[] = [];
let hls: Hls | null = null;
let cameraSequence = 0;
let snapshotController: AbortController | null = null;
let countdown = 120;
let weatherSequence = 0;
let lastRequestFailed = false;

function notify(message: string) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  window.setTimeout(() => ($("toast").hidden = true), 4500);
}
async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = sessionStorage.getItem("pantau-token");
  const response = await fetch(path, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401)
    throw new Error("Akses membutuhkan token. Buka pengaturan koneksi (⚙).");
  if (!response.ok)
    throw new Error(`Permintaan gagal (HTTP ${response.status}).`);
  return response.json();
}
const precisionText = (e: Event) =>
  !e.location
    ? "Lokasi tidak ditentukan"
    : {
        city: "Perkiraan pusat kota / wilayah · dari judul",
        province: "Perkiraan pusat provinsi · dari judul",
        epicenter: "Episentrum · data resmi BMKG",
        "satellite-pixel": "Pusat piksel satelit · anomali panas",
      }[e.location.precision];
function renderSources() {
  if (!snapshot) return;
  const statusLabel = {
    ok: "Tersedia",
    stale: "Data lama",
    error: "Gagal",
    unconfigured: "Belum diatur",
  };
  $("health-count").textContent =
    `${snapshot.sources.filter((s) => s.status === "ok").length}/${snapshot.sources.length}`;
  $("sources").innerHTML = snapshot.sources
    .map(
      (s) =>
        `<div class="source-item"><div><span class="status-dot ${s.status}"></span><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a><span class="source-status ${s.status}">${statusLabel[s.status]}</span></div><small>${s.fetchedAt ? `Diambil ${esc(fmtTime(s.fetchedAt))} · ${s.count} item` : "Belum ada data"}${s.message ? `<br>${esc(s.message)}` : ""}</small></div>`,
    )
    .join("");
}
function render() {
  if (!snapshot) return;
  const search = $<HTMLInputElement>("search").value.toLocaleLowerCase("id");
  const category = $<HTMLSelectElement>("category").value;
  const onlyLocated = $<HTMLInputElement>("located-only").checked;
  const windowStart =
    Date.now() - Number($<HTMLSelectElement>("hours").value) * 3_600_000;
  filtered = snapshot.events
    .map(applyTopicPolicy)
    .filter(isAllowedReport)
    .filter(
      (e) =>
        Date.parse(e.publishedAt ?? "") >= windowStart &&
        (category === "all" || e.category === category) &&
        (!onlyLocated || !!e.location) &&
        `${e.title} ${e.source} ${e.location?.name ?? ""}`
          .toLocaleLowerCase("id")
          .includes(search),
    );
  const located = filtered.filter((e) => e.location);
  $("count-events").textContent = String(filtered.length);
  $("count-located").textContent = String(located.length);
  $("count-sources").textContent = String(
    snapshot.sources.filter((s) => s.status === "ok").length,
  );
  $("count-regions").textContent = String(
    new Set(located.map((e) => e.location!.name)).size,
  );
  $("map-count").textContent = `${located.length} titik`;
  $("wire-count").textContent = String(filtered.length);
  $("map-empty").hidden = located.length > 0;
  markers.clearLayers();
  markerIndex.clear();
  // Larger/selected markers stay on top. Coincident approximate locations share a popup list.
  const groups = new Map<string, Event[]>();
  for (const e of located) {
    const key = `${e.location!.lat},${e.location!.lon}`;
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const e = group[0],
      loc = e.location!;
    const marker = L.circleMarker([loc.lat, loc.lon], {
      radius: Math.min(14, 6 + Math.log2(group.length) * 2),
      weight: 2,
      color: colors[e.category],
      fillColor: colors[e.category],
      fillOpacity: 0.38,
    }).addTo(markers);
    const popup = document.createElement("div");
    popup.className = "map-popup";
    const label = document.createElement("small");
    label.textContent = `${loc.name} · ${group.length} laporan`;
    popup.append(label);
    for (const entry of group.slice(0, 12)) {
      const button = document.createElement("button");
      button.textContent = entry.title;
      button.onclick = () => showDetail(entry);
      popup.append(button);
    }
    if (group.length > 12) {
      const more = document.createElement("small");
      more.textContent = "Laporan lainnya tersedia di daftar.";
      popup.append(more);
    }
    marker.bindPopup(popup, { maxWidth: 320 });
    for (const entry of group) markerIndex.set(entry.id, marker);
  }
  $("events").innerHTML = filtered.length
    ? filtered
        .map(
          (e) =>
            `<article class="event-card" style="--event-color:${colors[e.category]}"><div class="event-meta"><span class="category-label">${labels[e.category]}</span><time title="${esc(fmtTime(e.publishedAt))}">${esc(age(e.publishedAt))}</time></div><button class="event-title" data-event="${e.id}">${esc(e.title)}</button><div class="event-bottom"><span>${esc(e.source)}</span><span class="location-label">⌖ ${esc(e.location?.name ?? "Belum terpetakan")}</span></div></article>`,
        )
        .join("")
    : '<div class="empty-state"><span>◎</span><h3>Tidak ada laporan.</h3><p>Coba kategori, pencarian, atau rentang waktu lain. Sumber yang gagal belum tentu tidak memiliki kejadian.</p></div>';
  $("events")
    .querySelectorAll<HTMLButtonElement>("[data-event]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          const e = filtered.find((e) => e.id === b.dataset.event)!;
          showDetail(e);
          if (e.location) {
            map.flyTo([e.location.lat, e.location.lon], 8);
            markerIndex.get(e.id)?.openPopup();
          }
        }),
    );
  $("updated").textContent = `Diambil ${fmtTime(snapshot.generatedAt)}`;
}
function showDetail(e: Event) {
  const stale = snapshot?.sources.some(
    (s) =>
      s.status === "stale" &&
      (s.name === e.source || (s.id === "bmkg" && e.source === "BMKG")),
  );
  $("detail-content").innerHTML =
    `<div class="eyebrow" style="color:${colors[e.category]}">${labels[e.category]} / ${esc(e.source)}</div><h2>${esc(e.title)}</h2>${e.category.startsWith("ham-") ? '<p class="muted">Pemantauan topik HAM; klasifikasi ini bukan verifikasi tuduhan atau putusan pelanggaran. Baca dugaan, bantahan, dan konteks dalam sumber asli.</p>' : ""}<p>${esc(e.summary || "Ringkasan tidak tersedia. Baca laporan asli melalui tautan sumber.")}</p><dl><dt>Publikasi</dt><dd>${esc(fmtTime(e.publishedAt))}</dd><dt>Pertama dibaca dalam pengambilan ini</dt><dd>${esc(fmtTime(e.observedAt))}</dd><dt>Lokasi</dt><dd>${esc(e.location?.name ?? "Tidak diketahui")}</dd><dt>Ketelitian lokasi</dt><dd>${esc(precisionText(e))}</dd><dt>Status informasi</dt><dd>${e.verification === "official" ? "Data sumber resmi" : e.verification === "sensor" ? "Deteksi sensor, perlu interpretasi" : "Laporan penerbit, belum diverifikasi PANTAU"}${stale ? " · cache sumber lama" : ""}</dd>${e.confidence ? `<dt>Confidence sensor</dt><dd>${esc(e.confidence)}</dd>` : ""}</dl><a class="solid-button" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Baca di sumber asli ↗</a>`;
  $<HTMLDialogElement>("detail").showModal();
}
async function refresh() {
  snapshotController?.abort();
  const controller = new AbortController();
  snapshotController = controller;
  $("refresh").setAttribute("disabled", "");
  $("sync-label").textContent = "SINKRONISASI";
  try {
    const data = await api<Snapshot>(
      `/api/situation?hours=${$<HTMLSelectElement>("hours").value}`,
      controller.signal,
    );
    if (controller !== snapshotController) return;
    snapshot = data;
    countdown = 120;
    lastRequestFailed = false;
    renderSources();
    render();
    const failed = data.sources.filter(
      (s) => s.status === "error" || s.status === "stale",
    );
    $("notice").hidden =
      failed.length === 0 && data.archive?.status !== "error";
    $("notice").textContent =
      `${failed.length} sumber mengalami gangguan: ${failed.map((s) => s.name).join(", ")}. Periksa kesehatan sumber untuk waktu data terakhir.`;
    if (data.archive?.status === "error")
      $("notice").textContent =
        data.archive.message ??
        "Arsip gagal disimpan; laporan live belum terjamin tersimpan.";
    $("sync-label").textContent = "TERHUBUNG";
  } catch (error) {
    if (controller.signal.aborted) return;
    lastRequestFailed = true;
    $("notice").hidden = false;
    $("notice").textContent =
      `${error instanceof Error ? error.message : "Gagal terhubung."} ${snapshot ? "Tampilan mempertahankan hasil sebelumnya." : ""}`;
    if (!snapshot)
      $("events").innerHTML =
        '<div class="empty-state"><h3>Belum terhubung.</h3><p>Periksa koneksi atau token akses, lalu sinkronkan ulang.</p></div>';
    $("sync-label").textContent = "KONEKSI GAGAL";
  } finally {
    if (controller === snapshotController)
      $("refresh").removeAttribute("disabled");
  }
}
async function weather() {
  const seq = ++weatherSequence;
  $("weather").innerHTML = '<p class="muted">Mengambil prakiraan…</p>';
  try {
    const data = await api<{
      value: Weather | null;
      status: string;
      fetchedAt: string | null;
    }>(
      `/api/weather?city=${encodeURIComponent($<HTMLSelectElement>("city").value)}`,
    );
    if (seq !== weatherSequence || !data.value) return;
    const w = data.value;
    $("weather").innerHTML =
      `<div class="temperature">${Math.round(w.temperature)}<span>°C</span><span class="weather-symbol">${w.precipitation > 0 ? "☂" : w.code <= 1 ? "☀" : "☁"}</span></div><div class="weather-readings"><span>Hujan <b>${w.precipitation} mm</b></span><span>Angin <b>${w.wind} km/j</b></span></div><div class="forecast">${w.daily.map((d) => `<div><span>${new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }).format(new Date(d.date + "T12:00:00+07:00"))}</span><strong>${Math.round(d.max)}°<small> / ${Math.round(d.min)}°</small></strong><span>☂ ${d.rain}%</span></div>`).join("")}</div><small class="weather-credit">Open-Meteo · ${data.status === "stale" ? "DATA LAMA · " : ""}${esc(fmtTime(w.fetchedAt))}<br>Waktu model: ${esc(fmtTime(w.time))}</small>`;
  } catch {
    if (seq === weatherSequence)
      $("weather").innerHTML =
        '<p class="muted">Prakiraan tidak tersedia. Sumber gagal diakses.</p>';
  }
}
async function cameras() {
  try {
    const d = await api<{ cameras: Camera[]; message: string }>("/api/cameras");
    $("camera-count").textContent = `${d.cameras.length} SUMBER`;
    $("cameras").innerHTML = d.cameras.length
      ? d.cameras
          .map(
            (c) =>
              `<div class="camera-row"><div><strong>${esc(c.name)}</strong><small>${esc(c.region)}</small></div>${c.type === "hls" ? `<button class="text-button" data-camera="${esc(c.id)}">Buka ↗</button>` : `<a class="text-button" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Buka ↗</a>`}<a href="${esc(c.sourceUrl)}" class="muted" target="_blank" rel="noopener noreferrer" aria-label="Sumber ${esc(c.name)}">Sumber</a></div>`,
          )
          .join("")
      : `<div class="camera-placeholder"><span>▣</span><p>${esc(d.message)}</p></div>`;
    $("cameras")
      .querySelectorAll<HTMLButtonElement>("[data-camera]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            const seq = ++cameraSequence;
            const c = d.cameras.find((c) => c.id === b.dataset.camera)!;
            const video = $<HTMLVideoElement>("camera-video");
            hls?.destroy();
            $("camera-name").textContent = c.name;
            $("camera-message").textContent = "Memuat stream dari sumber…";
            $<HTMLDialogElement>("camera-dialog").showModal();
            video.onloadeddata = () =>
              ($("camera-message").textContent =
                "Stream tersedia. Tekan putar untuk menonton.");
            video.onerror = () =>
              ($("camera-message").textContent =
                "Stream tidak tersedia atau akses ditolak sumber.");
            if (video.canPlayType("application/vnd.apple.mpegurl"))
              video.src = c.url;
            else {
              try {
                const { default: HlsPlayer } = await import("hls.js");
                if (
                  seq !== cameraSequence ||
                  !$<HTMLDialogElement>("camera-dialog").open
                )
                  return;
                if (HlsPlayer.isSupported()) {
                  hls = new HlsPlayer();
                  hls.loadSource(c.url);
                  hls.attachMedia(video);
                  hls.on(HlsPlayer.Events.ERROR, (_event, data) => {
                    if (data.fatal)
                      $("camera-message").textContent =
                        "Stream tidak tersedia; periksa izin, CORS, dan alamat sumber.";
                  });
                } else
                  $("camera-message").textContent =
                    "Browser ini belum mendukung stream HLS.";
              } catch {
                $("camera-message").textContent =
                  "Pemutar kamera gagal dimuat.";
              }
            }
          }),
      );
  } catch {
    $("cameras").textContent = "Konfigurasi kamera tidak dapat diambil.";
  }
}
async function initializeExtras() {
  try {
    const cities = await api<{ name: string }[]>("/api/cities");
    const old = $<HTMLSelectElement>("city").value;
    $("city").innerHTML = cities
      .map(
        (c) =>
          `<option value="${esc(c.name)}">${esc(c.name.replace(/\b\w/g, (c) => c.toUpperCase()))}</option>`,
      )
      .join("");
    $<HTMLSelectElement>("city").value = old;
  } catch {
    /* Jakarta remains available. */
  }
  await Promise.all([
    weather(),
    cameras(),
    environment.refresh($<HTMLSelectElement>("city").value),
    officialSocial.refresh(),
  ]);
}
$("search").oninput = render;
$("category").onchange = render;
$("located-only").onchange = render;
$("hours").onchange = () => {
  $("events").setAttribute("aria-busy", "true");
  void refresh().finally(() => $("events").removeAttribute("aria-busy"));
};
$("city").onchange = () => {
  void weather();
  void environment.air($<HTMLSelectElement>("city").value);
};
$("refresh").onclick = () => {
  void refresh();
  void weather();
};
$("reset-map").onclick = () => map.flyTo([-2.5, 118], 4);
$("show-method").onclick = () => $<HTMLDialogElement>("method").showModal();
$("access").onclick = () => $<HTMLDialogElement>("connection").showModal();
$("token-form").onsubmit = (e) => {
  e.preventDefault();
  sessionStorage.setItem(
    "pantau-token",
    $<HTMLInputElement>("api-token").value.trim(),
  );
  $<HTMLInputElement>("api-token").value = "";
  $<HTMLDialogElement>("connection").close();
  void refresh();
  void initializeExtras();
};
document
  .querySelectorAll<HTMLButtonElement>("[data-close]")
  .forEach(
    (b) => (b.onclick = () => $<HTMLDialogElement>(b.dataset.close!).close()),
  );
$("camera-dialog").addEventListener("close", () => {
  cameraSequence++;
  hls?.destroy();
  hls = null;
  const video = $<HTMLVideoElement>("camera-video");
  video.pause();
  video.removeAttribute("src");
  video.load();
});
$("export").onclick = () => {
  if (!snapshot) {
    notify("Belum ada data untuk diekspor.");
    return;
  }
  const collection = {
    type: "FeatureCollection",
    generatedAt: snapshot.generatedAt,
    sources: snapshot.sources,
    omittedUnlocated: filtered.filter((e) => !e.location).length,
    features: filtered
      .filter((e) => e.location)
      .map((e) => ({
        type: "Feature",
        id: e.id,
        geometry: {
          type: "Point",
          coordinates: [e.location!.lon, e.location!.lat],
        },
        properties: { ...e, location: e.location },
      })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(collection, null, 2)], {
      type: "application/geo+json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `pantau-${new Date().toISOString().slice(0, 10)}.geojson`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(
    `${collection.features.length} titik diekspor; ${collection.omittedUnlocated} laporan tanpa lokasi tidak disertakan.`,
  );
};
function tick() {
  $("clock").textContent =
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date()) + " WIB";
  if (!snapshotController || !($("refresh") as HTMLButtonElement).disabled) {
    countdown--;
    if (countdown <= 0) {
      countdown = 120;
      void refresh();
    } else if (snapshot && !lastRequestFailed)
      $("sync-label").textContent =
        `SYNC ${String(Math.floor(countdown / 60)).padStart(2, "0")}:${String(countdown % 60).padStart(2, "0")}`;
  }
}
new ResizeObserver(() => map.invalidateSize()).observe($("map"));
tick();
setInterval(tick, 1000);
setInterval(() => {
  void weather();
  void environment.air($<HTMLSelectElement>("city").value);
}, 600_000);
void refresh();
void initializeExtras();
