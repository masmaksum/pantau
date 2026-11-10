import L from "leaflet";
import { dashboardLayout } from "./layout.js";
import { mountNavigation } from "./navigation.js";
import { mountNewsArchive } from "./archive-ui.js";
import { mountEnvironment } from "./environment-ui.js";
import { mountOfficialSocial } from "./social-ui.js";
import type Hls from "hls.js";
import { isAllowedReport, visibleCategories } from "../shared/topic-policy.js";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./workspace.css";
import {
  filterReports,
  newsReports,
  newsSources,
} from "../shared/report-view.js";
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

document.querySelector("#app")!.innerHTML =
  dashboardLayout(
    visibleCategories
      .map((k) => `<option value="${k}">${labels[k]}</option>`)
      .join(""),
  ) +
  `
<dialog id="detail"><button class="dialog-close" data-close="detail" aria-label="Tutup detail">×</button><div id="detail-content"></div></dialog>
<dialog id="method"><button class="dialog-close" data-close="method" aria-label="Tutup cara kerja">×</button><div class="eyebrow">METODE & KETERBATASAN</div><h2>Dari sumber ke situasi.</h2><p>PANTAU membaca RSS dan API sumber, menyeragamkan laporan, lalu mengelompokkannya memakai kata kunci. Kategori bersifat heuristik, bukan penilaian AI atau verifikasi fakta.</p><p>Kriminal umum, transportasi, ekonomi, dan selebritis dikecualikan berdasarkan judul, ringkasan, serta kategori RSS/Atom. Laporan tentang kekerasan aparat, represi aktivis, kekerasan ormas, persekusi, dan hak asasi lainnya diprioritaskan meskipun memuat istilah topik yang dikecualikan. Label HAM adalah klasifikasi topik, bukan temuan hukum; dugaan dan bantahan tetap mengikuti sumber. Penyaringan berbasis kata kunci masih dapat keliru.</p><p>Lokasi berita hanya dicari dalam judul menggunakan daftar kota/provinsi terbatas. Judul dengan beberapa lokasi atau lokasi yang tidak dikenali tidak dipasangkan ke peta. Titik adalah pusat wilayah perkiraan, bukan alamat kejadian.</p><p>Laporan dengan URL penerbit yang sama digabung. Dua URL atau judul serupa tidak otomatis berarti dua kejadian, maupun dua konfirmasi independen. Waktu filter menggunakan waktu publikasi; waktu kejadian bisa berbeda.</p><p>Cache terakhir tetap tersedia saat sumber gagal dan ditandai “data lama”. Waktu pengambilan tercantum di tiap sumber. Hotspot adalah anomali panas, bukan konfirmasi kebakaran. Cuaca adalah keluaran model.</p><p>Collector dan koneksi akun media sosial melalui API resmi belum diaktifkan. Fitur pasar, AIS, ADS-B, MAGMA, dan analisis AI belum tersedia. Artikel lengkap, foto, dan caption yang berhasil dipreservasi tersedia pada Kanal Berita → Arsip.</p></dialog>
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
const archive = mountNewsArchive(
  api,
  fmtTime,
  labels,
  map,
  apiBlob,
  () => navigation.go("peta"),
  () => render(),
);
const navigation = mountNavigation((view, news) => {
  if (view === "peta") requestAnimationFrame(() => map.invalidateSize());
  if (view === "berita" && news === "arsip") archive.activate();
});
const markers = L.layerGroup().addTo(map);
const markerIndex = new Map<string, L.CircleMarker>();
const cameraMarkers = L.layerGroup();
let focusedReportMarker: L.CircleMarker | null = null;
let configuredCameras: Camera[] = [];
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
  return (await apiResponse(path, signal)).json();
}
async function apiBlob(path: string): Promise<Blob> {
  return (await apiResponse(path)).blob();
}
async function apiResponse(path: string, signal?: AbortSignal) {
  const token = sessionStorage.getItem("pantau-token");
  const response = await fetch(path, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401)
    throw new Error("Akses membutuhkan token. Buka pengaturan koneksi (⚙).");
  if (!response.ok)
    throw new Error(`Permintaan gagal (HTTP ${response.status}).`);
  return response;
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
  filtered = filterReports(snapshot.events, {
    hours: Number($<HTMLSelectElement>("map-hours").value),
    category: $<HTMLSelectElement>("map-category").value,
    region: $<HTMLSelectElement>("map-region").value,
  });
  const reports = filterReports(newsReports(snapshot), {
    hours: Number($<HTMLSelectElement>("hours").value),
    category: $<HTMLSelectElement>("category").value,
    source: $<HTMLSelectElement>("news-source").value,
    located: $<HTMLInputElement>("located-only").checked,
    search: $<HTMLInputElement>("search").value,
  });
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
  $("wire-count").textContent = `${reports.length} berita`;
  renderOverview();
  $("map-empty").hidden =
    located.length > 0 ||
    !!focusedReportMarker ||
    archive.hasMapMarker() ||
    (cameraMarkers.getLayers().length > 0 && map.hasLayer(cameraMarkers));
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
  $("events").innerHTML = reports.length
    ? reports
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
          const e = reports.find((e) => e.id === b.dataset.event)!;
          showDetail(e);
        }),
    );
  $("updated").textContent = `Diambil ${fmtTime(snapshot.generatedAt)}`;
}
function updateFilterOptions() {
  if (!snapshot) return;
  const region = $<HTMLSelectElement>("map-region"),
    oldRegion = region.value;
  region.innerHTML =
    '<option value="all">Semua wilayah</option>' +
    [
      ...new Set(
        snapshot.events
          .filter(isAllowedReport)
          .flatMap((e) => (e.location ? [e.location.name] : [])),
      ),
    ]
      .sort()
      .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
      .join("");
  region.value = [...region.options].some((o) => o.value === oldRegion)
    ? oldRegion
    : "all";
  const source = $<HTMLSelectElement>("news-source"),
    oldSource = source.value;
  source.innerHTML =
    '<option value="all">Semua penerbit</option>' +
    newsSources(snapshot)
      .map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`)
      .join("");
  source.value = [...source.options].some((o) => o.value === oldSource)
    ? oldSource
    : "all";
}
function renderOverview() {
  const topics = new Map<Category, number>();
  for (const event of filtered)
    topics.set(event.category, (topics.get(event.category) ?? 0) + 1);
  $("summary-window").textContent =
    `${$<HTMLSelectElement>("map-hours").value} JAM`;
  $("topic-summary").innerHTML =
    [...topics]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(
        ([category, count]) =>
          `<div class="topic-row"><span>${labels[category]}</span><strong>${count}</strong></div>`,
      )
      .join("") || '<p class="muted">Belum ada laporan sesuai filter.</p>';
  $("highlights").innerHTML =
    [...filtered]
      .sort(
        (a, b) =>
          Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""),
      )
      .slice(0, 3)
      .map(
        (e) =>
          `<article class="highlight"><small>${esc(labels[e.category])} · ${esc(age(e.publishedAt))}</small><button class="event-title" data-highlight="${e.id}">${esc(e.title)}</button><small>${esc(e.source)} · ${esc(e.location?.name ?? "Lokasi belum diketahui")}</small></article>`,
      )
      .join("") || '<p class="muted">Tidak ada sorotan untuk filter ini.</p>';
  $("highlights")
    .querySelectorAll<HTMLButtonElement>("[data-highlight]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          showDetail(filtered.find((e) => e.id === b.dataset.highlight)!)),
    );
}
function showDetail(e: Event) {
  const stale = snapshot?.sources.some(
    (s) =>
      s.status === "stale" &&
      (s.name === e.source || (s.id === "bmkg" && e.source === "BMKG")),
  );
  $("detail-content").innerHTML =
    `<div class="eyebrow" style="color:${colors[e.category]}">${labels[e.category]} / ${esc(e.source)}</div><h2>${esc(e.title)}</h2>${e.category.startsWith("ham-") ? '<p class="muted">Pemantauan topik HAM; klasifikasi ini bukan verifikasi tuduhan atau putusan pelanggaran. Baca dugaan, bantahan, dan konteks dalam sumber asli.</p>' : ""}<p>${esc(e.summary || "Ringkasan tidak tersedia. Baca laporan asli melalui tautan sumber.")}</p><dl><dt>Publikasi</dt><dd>${esc(fmtTime(e.publishedAt))}</dd><dt>Pertama dibaca dalam pengambilan ini</dt><dd>${esc(fmtTime(e.observedAt))}</dd><dt>Lokasi</dt><dd>${esc(e.location?.name ?? "Tidak diketahui")}</dd><dt>Ketelitian lokasi</dt><dd>${esc(precisionText(e))}</dd><dt>Status informasi</dt><dd>${e.verification === "official" ? "Data sumber resmi" : e.verification === "sensor" ? "Deteksi sensor, perlu interpretasi" : "Laporan penerbit, belum diverifikasi PANTAU"}${stale ? " · cache sumber lama" : ""}</dd>${e.confidence ? `<dt>Confidence sensor</dt><dd>${esc(e.confidence)}</dd>` : ""}</dl><a class="solid-button" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">Baca di sumber asli ↗</a>`;
  const source = snapshot
    ? newsSources(snapshot).find((s) => s.name === e.source)
    : undefined;
  const actions = document.createElement("div");
  actions.className = "layer-actions";
  if (source) {
    const read = document.createElement("button");
    read.className = "solid-button";
    read.textContent = "Teks lengkap, foto & arsip →";
    read.onclick = () => {
      $<HTMLDialogElement>("detail").close();
      navigation.go("berita", "arsip");
      void archive
        .openReport(source.id, e.url)
        .catch(() =>
          notify(
            "Artikel belum tersedia di arsip. Periksa status pengambilan sumber.",
          ),
        );
    };
    actions.append(read);
  }
  if (e.location) {
    const locate = document.createElement("button");
    locate.className = "outline-button";
    locate.textContent = "Lihat di peta";
    locate.onclick = () => {
      $<HTMLDialogElement>("detail").close();
      navigation.go("peta");
      requestAnimationFrame(() => {
        map.invalidateSize();
        if (focusedReportMarker) {
          map.removeLayer(focusedReportMarker);
          focusedReportMarker = null;
        }
        map.flyTo([e.location!.lat, e.location!.lon], 8);
        const currentMarker = markerIndex.get(e.id);
        if (currentMarker) currentMarker.openPopup();
        else {
          const popup = document.createElement("div"),
            title = document.createElement("strong"),
            description = document.createElement("p");
          title.textContent = `LOKASI PILIHAN · ${e.title}`;
          description.textContent = `${precisionText(e)}. Titik pilihan ini berada di luar filter peta dan tidak masuk hitungan laporan sesuai filter.`;
          const remove = document.createElement("button");
          remove.className = "text-button";
          remove.textContent = "Hapus titik pilihan";
          remove.onclick = () => {
            if (focusedReportMarker) map.removeLayer(focusedReportMarker);
            focusedReportMarker = null;
            render();
          };
          popup.append(title, description, remove);
          focusedReportMarker = L.circleMarker(
            [e.location!.lat, e.location!.lon],
            {
              radius: 10,
              weight: 3,
              color: colors[e.category],
              dashArray: "4 4",
            },
          )
            .addTo(map)
            .bindPopup(popup)
            .openPopup();
        }
        $("map-empty").hidden = true;
      });
    };
    actions.append(locate);
  }
  $("detail-content").append(actions);
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
      `/api/situation?hours=72`,
      controller.signal,
    );
    if (controller !== snapshotController) return;
    snapshot = data;
    countdown = 120;
    lastRequestFailed = false;
    renderSources();
    updateFilterOptions();
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
    if (seq !== weatherSequence) return;
    if (!data.value) {
      $("weather").textContent =
        "Prakiraan belum tersedia dari sumber. Coba sinkronkan kembali.";
      return;
    }
    const w = data.value;
    $("weather").innerHTML =
      `<div class="temperature">${Math.round(w.temperature)}<span>°C</span><span class="weather-symbol">${w.precipitation > 0 ? "☂" : w.code <= 1 ? "☀" : "☁"}</span></div><div class="weather-readings"><span>Hujan <b>${w.precipitation} mm</b></span><span>Angin <b>${w.wind} km/j</b></span></div><div class="forecast">${w.daily.map((d) => `<div><span>${new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "Asia/Jakarta" }).format(new Date(d.date + "T12:00:00+07:00"))}</span><strong>${Math.round(d.max)}°<small> / ${Math.round(d.min)}°</small></strong><span>☂ ${d.rain}%</span></div>`).join("")}</div><small class="weather-credit">Open-Meteo · ${data.status === "stale" ? "DATA LAMA · " : ""}${esc(fmtTime(w.fetchedAt))}<br>Waktu model: ${esc(fmtTime(w.time))}</small>`;
  } catch {
    if (seq === weatherSequence)
      $("weather").innerHTML =
        '<p class="muted">Prakiraan tidak tersedia. Sumber gagal diakses.</p>';
  }
}
async function openCamera(c: Camera) {
  const seq = ++cameraSequence;
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
  if (video.canPlayType("application/vnd.apple.mpegurl")) video.src = c.url;
  else {
    try {
      const { default: HlsPlayer } = await import("hls.js");
      if (seq !== cameraSequence || !$<HTMLDialogElement>("camera-dialog").open)
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
      $("camera-message").textContent = "Pemutar kamera gagal dimuat.";
    }
  }
}
function renderCameras() {
  cameraMarkers.clearLayers();
  const toggle = $<HTMLInputElement>("cctv-map-toggle");
  toggle.disabled = !configuredCameras.some((c) => c.location);
  if (toggle.disabled) {
    toggle.checked = false;
    map.removeLayer(cameraMarkers);
  }
  $("cameras").innerHTML = configuredCameras.length
    ? configuredCameras
        .map(
          (c) =>
            `<div class="camera-row"><div><strong>${esc(c.name)}</strong><small>${esc(c.region)} · ${c.type === "hls" ? "HLS · akses diperiksa saat dibuka" : "Tautan situs kamera"} · ${c.location ? "Koordinat tersedia" : "Belum berkoordinat"}</small></div>${c.type === "hls" ? `<button class="text-button" data-camera="${esc(c.id)}">Buka kamera ↗</button>` : `<a class="text-button" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Buka situs ↗</a>`}<a href="${esc(c.sourceUrl)}" class="muted" target="_blank" rel="noopener noreferrer">Sumber</a></div>`,
        )
        .join("")
    : '<p class="muted">Belum ada sumber CCTV yang dikonfigurasi. Tidak ada kamera yang dinyatakan aktif.</p>';
  $("cameras")
    .querySelectorAll<HTMLButtonElement>("[data-camera]")
    .forEach(
      (b) =>
        (b.onclick = () => {
          void openCamera(
            configuredCameras.find((c) => c.id === b.dataset.camera)!,
          );
        }),
    );
  for (const c of configuredCameras) {
    if (!c.location) continue;
    const popup = document.createElement("div"),
      title = document.createElement("strong"),
      label = document.createElement("p"),
      source = document.createElement("a");
    title.textContent = `CCTV · ${c.name}`;
    label.textContent = `${c.region} · Koordinat konfigurasi kamera, bukan lokasi kejadian. Akses diperiksa saat dibuka.`;
    source.href = c.sourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Sumber kamera ↗";
    popup.append(title, label, source);
    if (c.type === "hls") {
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = "Buka kamera";
      button.onclick = () => {
        void openCamera(c);
      };
      popup.append(button);
    } else {
      const link = document.createElement("a");
      link.href = c.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Buka situs kamera ↗";
      popup.append(document.createElement("br"), link);
    }
    L.marker([c.location.lat, c.location.lon], {
      icon: L.divIcon({
        className: "cctv-pin",
        html: '<span aria-hidden="true">▣</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      title: `CCTV: ${c.name}`,
      alt: `CCTV: ${c.name}`,
    })
      .addTo(cameraMarkers)
      .bindPopup(popup);
  }
  if ($<HTMLInputElement>("cctv-map-toggle").checked) cameraMarkers.addTo(map);
}
async function cameras() {
  try {
    const d = await api<{ cameras: Camera[]; status: string; message: string }>(
      "/api/cameras",
    );
    configuredCameras = d.cameras;
    renderCameras();
    $("camera-count").textContent =
      `${d.cameras.length} kamera · ${d.cameras.filter((c) => c.location).length} berkoordinat`;
    if (d.status === "error" || !d.cameras.length)
      $("cameras").textContent = d.message;
    render();
  } catch {
    configuredCameras = [];
    renderCameras();
    $("camera-count").textContent = "Status belum diketahui";
    $("cameras").textContent =
      "Konfigurasi kamera tidak dapat diambil. Ketersediaan belum diketahui.";
    render();
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
$("hours").onchange = render;
$("news-source").onchange = render;
for (const id of ["map-category", "map-region", "map-hours"])
  $(id).onchange = render;
$("source-health").onclick = () =>
  $<HTMLDialogElement>("source-dialog").showModal();
$("open-cctv").onclick = () => {
  const panel = $<HTMLDetailsElement>("cctv-panel");
  panel.open = !panel.open;
  if (panel.open) panel.scrollIntoView({ block: "nearest" });
};
$("cctv-panel").addEventListener("toggle", () =>
  $("open-cctv").setAttribute(
    "aria-expanded",
    String($<HTMLDetailsElement>("cctv-panel").open),
  ),
);
$("cctv-map-toggle").onchange = () => {
  if ($<HTMLInputElement>("cctv-map-toggle").checked) cameraMarkers.addTo(map);
  else map.removeLayer(cameraMarkers);
  render();
};
$("city").onchange = () => {
  void weather();
  void environment.air($<HTMLSelectElement>("city").value);
};
$("refresh").onclick = () => {
  void refresh();
  void initializeExtras();
};
$("reset-map").onclick = () => map.flyTo([-2.5, 118], 4);
$("show-method").onclick = () => $<HTMLDialogElement>("method").showModal();
$("source-method").onclick = () => {
  $<HTMLDialogElement>("source-dialog").close();
  $<HTMLDialogElement>("method").showModal();
};
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
