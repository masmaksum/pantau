import L from "leaflet";
import type {
  AirQuality,
  Biodiversity,
  ContextCollection,
  Dataset,
} from "../shared/environment.js";
import { forestTileUrl, validSatelliteDate } from "../shared/environment.js";

type Result<T> = {
  value: T | null;
  status: string;
  fetchedAt?: string | null;
  message?: string;
};
type Api = <T>(path: string, signal?: AbortSignal) => Promise<T>;
type CatalogItem = Dataset & { configured: boolean; configError?: string };
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const number = (n: number | null) =>
  n === null
    ? "Tidak tersedia"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const yesterday = () =>
  new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

export function mountEnvironment(
  map: L.Map,
  api: Api,
  fmtTime: (s: string | null) => string,
) {
  const slots = [
    "environment-base",
    "environment-raster",
    "environment-vector",
  ];
  slots.forEach((name, i) => {
    map.createPane(name);
    map.getPane(name)!.style.zIndex = String([250, 350, 390][i]);
  });
  const controls = document.createElement("details");
  controls.className = "environment-controls";
  controls.innerHTML = `<summary><span>◫ LAPISAN LINGKUNGAN</span><small>Konteks wilayah · terpisah dari laporan terbaru</small></summary>
    <div class="layer-grid">
      <label><input type="checkbox" data-raster="forest-loss" /> <span>Hilangnya tutupan pohon<small>UMD / GFW · tahunan · 30 m</small></span></label>
      <label><input type="checkbox" data-raster="nasa-imagery" /> <span>Citra satelit warna asli<small>NASA MODIS Terra · harian UTC</small></span></label>
      <label><input type="checkbox" data-raster="nasa-hotspots" /> <span>Hotspot arsip (gambar)<small>NASA VIIRS · bukan titik terverifikasi</small></span></label>
    </div>
    <div class="layer-settings"><label>Tutupan hilang 2001–<select id="loss-year" aria-label="Tahun akhir kehilangan tutupan">${Array.from(
      { length: 25 },
      (_, i) => 2025 - i,
    )
      .map((y) => `<option value="${y}">${y}</option>`)
      .join(
        "",
      )}</select></label><label>Tanggal NASA (UTC)<input type="date" id="satellite-date" value="${new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)}" min="2018-01-01" max="${yesterday()}" /></label></div>
    <div id="vector-controls" class="layer-grid"></div><div id="layer-status" class="layer-status" role="status">Lapisan belum diaktifkan. Tidak ada data konteks yang dihitung sebagai kejadian baru.</div>
    <div class="layer-actions"><button id="map-expand" class="text-button">⛶ Perluas peta</button><a id="worldview-link" class="text-button" href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">Bandingkan di Worldview ↗</a><button id="data-catalog-button" class="text-button">Sumber, tahun & lisensi ↗</button></div>
    <p class="layer-caution">Lapisan global dapat melintasi batas Indonesia. Irisan wilayah bukan bukti sebab-akibat. Raster NASA/GFW tidak termasuk ekspor laporan GeoJSON.</p>`;
  document.querySelector(".map-top")!.after(controls);
  const section = document.createElement("section");
  section.className = "environment-summary";
  section.innerHTML = `<article><div class="panel-title"><span>UDARA & ASAP</span><span class="small-tag">MODEL CAMS</span></div><div id="air-summary"><p class="muted">Mengambil model kualitas udara…</p></div><p class="environment-credit">Sumber: <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Copernicus CAMS & Open-Meteo ↗</a> · grid sekitar 45 km, bukan pengukuran stasiun.</p></article>
    <article><div class="panel-title"><span>BIODIVERSITAS INDONESIA</span><span class="small-tag">GBIF</span></div><div id="bio-summary"><p class="muted">Mengambil statistik catatan…</p></div><p class="environment-credit">Sumber: <a href="https://www.gbif.org/occurrence/search?country=ID" target="_blank" rel="noopener noreferrer">GBIF ↗</a> · klasifikasi IUCN dalam GBIF. Jumlah catatan, bukan spesies atau populasi; koordinat satwa tidak ditampilkan.</p></article>`;
  document.querySelector(".channels")!.before(section);
  const dialog = document.createElement("dialog");
  dialog.id = "environment-catalog";
  dialog.innerHTML =
    '<button class="dialog-close" id="close-catalog" aria-label="Tutup katalog">×</button><div class="eyebrow">SUMBER DATA / ASAL / KETERBATASAN</div><h2>Konteks di balik kejadian.</h2><p>Inventaris hasil riset Mandum Rimba, dengan adapter PANTAU yang mengambil data dari penyedia primer. “Siap diakses” berarti adapter tersedia, bukan jaminan data sudah berhasil diambil.</p><div id="catalog-items">Memuat katalog…</div><p class="muted">Referensi riset: <a href="https://github.com/ammar-rasyidi/mandum-rimba" target="_blank" rel="noopener noreferrer">Mandum Rimba ↗</a>. Implementasi dan merek PANTAU tetap mandiri.</p>';
  document.body.append(dialog);
  el("data-catalog-button").onclick = () => dialog.showModal();
  el("close-catalog").onclick = () => dialog.close();

  const layers = new Map<string, L.Layer>();
  const status = new Map<string, string>();
  const selected = new Set<string>();
  const sequences = new Map<string, number>();
  const displayStatus = () => {
    el("layer-status").textContent =
      [...status]
        .filter(([id]) => selected.has(id))
        .map(([, text]) => text)
        .join(" · ") ||
      "Lapisan belum diaktifkan. Data konteks terpisah dari laporan terbaru.";
  };
  const remove = (id: string) => {
    const old = layers.get(id);
    if (old) map.removeLayer(old);
    layers.delete(id);
  };
  function raster(id: string) {
    remove(id);
    const date = el<HTMLInputElement>("satellite-date").value;
    if (!validSatelliteDate(date)) {
      status.set(
        id,
        "Tanggal NASA tidak valid; pilih paling baru kemarin (UTC).",
      );
      displayStatus();
      return;
    }
    let layer: L.TileLayer;
    if (id === "forest-loss") {
      layer = L.tileLayer(
        forestTileUrl(Number(el<HTMLSelectElement>("loss-year").value)),
        {
          pane: "environment-raster",
          opacity: 0.8,
          maxNativeZoom: 12,
          maxZoom: 18,
          attribution:
            'Tree cover loss: <a href="https://www.globalforestwatch.org/">Hansen/UMD · GFW</a> (CC BY 4.0)',
        },
      );
    } else if (id === "nasa-imagery") {
      layer = L.tileLayer(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        {
          pane: "environment-base",
          maxNativeZoom: 9,
          maxZoom: 18,
          attribution:
            'Imagery: <a href="https://worldview.earthdata.nasa.gov/">NASA EOSDIS GIBS · MODIS Terra</a>',
        },
      );
    } else {
      layer = L.tileLayer.wms(
        "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi",
        {
          layers: "VIIRS_NOAA20_Thermal_Anomalies_375m_All",
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          pane: "environment-raster",
          maxNativeZoom: 9,
          maxZoom: 18,
          time: date,
          attribution:
            'Hotspots: <a href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS / GIBS · VIIRS</a>',
        } as L.WMSOptions,
      );
    }
    const label =
      id === "forest-loss"
        ? `UMD 2001–${el<HTMLSelectElement>("loss-year").value}`
        : `NASA ${date} UTC`;
    status.set(id, `${label}: memuat ubin…`);
    let errors = 0;
    let loaded = 0;
    layer.on("tileload", () => {
      loaded++;
      status.set(
        id,
        `${label}: ${loaded} ubin dimuat${errors ? `, ${errors} gagal` : ""}; bukan hitungan kejadian`,
      );
      displayStatus();
    });
    layer.on("tileerror", () => {
      errors++;
      status.set(id, `${label}: ${errors} ubin gagal; cakupan belum lengkap`);
      displayStatus();
    });
    layers.set(id, layer);
    layer.addTo(map);
    displayStatus();
    el<HTMLAnchorElement>("worldview-link").href =
      `https://worldview.earthdata.nasa.gov/?t=${date}`;
  }
  controls.querySelectorAll<HTMLInputElement>("[data-raster]").forEach(
    (input) =>
      (input.onchange = () => {
        const id = input.dataset.raster!;
        if (input.checked) {
          selected.add(id);
          raster(id);
        } else {
          selected.delete(id);
          remove(id);
          displayStatus();
        }
      }),
  );
  el("loss-year").onchange = () => {
    if (selected.has("forest-loss")) raster("forest-loss");
  };
  el("satellite-date").onchange = () => {
    for (const id of ["nasa-imagery", "nasa-hotspots"])
      if (selected.has(id)) raster(id);
  };
  el("map-expand").onclick = () => {
    const expanded = document
      .querySelector(".dashboard")!
      .classList.toggle("map-expanded");
    el("map-expand").textContent = expanded
      ? "⛶ Kembali ke dashboard"
      : "⛶ Perluas peta";
    map.invalidateSize();
  };
  async function vector(id: string, name: string) {
    const sequence = (sequences.get(id) ?? 0) + 1;
    sequences.set(id, sequence);
    remove(id);
    status.set(id, `${name}: mengambil konteks…`);
    displayStatus();
    try {
      const result = await api<Result<ContextCollection>>(
        `/api/context/${encodeURIComponent(id)}`,
      );
      if (!selected.has(id) || sequence !== sequences.get(id)) return;
      if (!result.value) {
        status.set(id, `${name}: ${result.message ?? "tidak tersedia"}`);
        displayStatus();
        return;
      }
      const color =
        id === "bnpb-history"
          ? "#65b9dd"
          : id === "mining-footprint"
            ? "#e2a56f"
            : "#9bacd7";
      const layer = L.geoJSON(result.value as any, {
        pane: "environment-vector",
        style: { color, weight: 1, fillOpacity: 0.15 },
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, {
            pane: "environment-vector",
            radius: 4,
            color,
          }),
        onEachFeature: (feature, layer) => {
          const content = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = name;
          content.append(title);
          for (const [key, value] of Object.entries(feature.properties ?? {})) {
            const p = document.createElement("p");
            p.textContent = `${key}: ${value}`;
            content.append(p);
          }
          const note = document.createElement("p");
          note.textContent =
            "Lapisan konteks; periksa sumber, tanggal, dan lisensi di katalog.";
          content.append(note);
          layer.bindPopup(content);
        },
      });
      layers.set(id, layer);
      layer.addTo(map);
      status.set(
        id,
        `${name}: ${result.value.features.length} fitur${result.value.truncated ? " · SAMPEL TERBATAS, bukan seluruh cakupan" : ""}${result.value.rejected ? ` · ${result.value.rejected} fitur ditolak` : ""}${result.status === "stale" ? " · DATA LAMA" : ""}`,
      );
      displayStatus();
    } catch {
      if (sequence === sequences.get(id)) {
        status.set(id, `${name}: gagal diambil`);
        displayStatus();
      }
    }
  }
  async function catalog() {
    try {
      const data = await api<{ datasets: CatalogItem[] }>("/api/datasets");
      const accessLabel = (d: CatalogItem) =>
        d.access === "excluded"
          ? "Dikecualikan"
          : d.configured
            ? d.access === "ready"
              ? "Siap diakses"
              : "Dikonfigurasi · belum tentu termuat"
            : d.access === "reference"
              ? "Referensi saja"
              : "Perlu konfigurasi";
      el("catalog-items").innerHTML = data.datasets
        .map(
          (d) =>
            `<article class="dataset-card"><div class="panel-title"><span>${esc(d.provider)}</span><span class="small-tag">${accessLabel(d)}</span></div><h3>${esc(d.name)}</h3><p>${esc(d.note)}</p><small>${esc(d.vintage)}<br>Lisensi: ${esc(d.license)}</small><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Buka sumber ↗</a></article>`,
        )
        .join("");
      el("vector-controls").innerHTML = data.datasets
        .filter((d) => d.kind === "vector")
        .map(
          (d) =>
            `<label><input type="checkbox" data-vector="${esc(d.id)}" ${d.configured ? "" : "disabled"} /><span>${esc(d.name)}<small>${d.configured ? esc(d.vintage) : "Perlu key / berkas operator"}</small></span></label>`,
        )
        .join("");
      el("vector-controls")
        .querySelectorAll<HTMLInputElement>("[data-vector]")
        .forEach(
          (input) =>
            (input.onchange = () => {
              const id = input.dataset.vector!;
              if (input.checked) {
                selected.add(id);
                void vector(id, data.datasets.find((d) => d.id === id)!.name);
              } else {
                selected.delete(id);
                sequences.set(id, (sequences.get(id) ?? 0) + 1);
                remove(id);
                displayStatus();
              }
            }),
        );
    } catch {
      el("catalog-items").textContent =
        "Katalog tidak dapat diambil. Periksa koneksi atau token akses.";
    }
  }
  let airSequence = 0;
  async function air(city: string) {
    const sequence = ++airSequence;
    el("air-summary").innerHTML =
      '<p class="muted">Mengambil model kualitas udara…</p>';
    try {
      const data = await api<Result<AirQuality>>(
        `/api/air-quality?city=${encodeURIComponent(city)}`,
      );
      if (sequence !== airSequence) return;
      if (!data.value) throw new Error("Unavailable");
      const a = data.value;
      el("air-summary").innerHTML =
        `<h3 class="environment-city">${esc(a.city)} <small>${data.status === "stale" ? "DATA LAMA" : "SAMPEL MODEL"}</small></h3><div class="environment-values"><div><strong>${number(a.pm25)}</strong><span>PM2.5 · µg/m³</span></div><div><strong>${number(a.pm10)}</strong><span>PM10 · µg/m³</span></div><div><strong>${number(a.usAqi)}</strong><span>US AQI · Open-Meteo</span></div></div><p class="model-time">Waktu model ${esc(fmtTime(a.time))}<br>Diambil ${esc(fmtTime(data.fetchedAt ?? null))}</p>`;
    } catch {
      if (sequence === airSequence)
        el("air-summary").innerHTML =
          '<p class="muted">Model udara tidak tersedia; tidak ada nilai pengganti atau simulasi.</p>';
    }
  }
  async function biodiversity() {
    try {
      const data = await api<Result<Biodiversity>>("/api/biodiversity");
      if (!data.value) throw new Error("Unavailable");
      const b = data.value;
      el("bio-summary").innerHTML =
        `<h3 class="environment-city">Catatan keberadaan <small>${b.startYear}–${b.endYear}${data.status === "stale" ? " · DATA LAMA" : ""}</small></h3><div class="environment-values"><div><strong>${number(b.records)}</strong><span>Seluruh catatan</span></div>${["CR", "EN", "VU"].map((code) => `<div><strong>${number(b.threatCounts.find((c) => c.code === code)?.count ?? null)}</strong><span>${{ CR: "Kritis", EN: "Terancam", VU: "Rentan" }[code]} · ${code}</span></div>`).join("")}</div><p class="model-time">Cakupan nasional, tidak mengikuti kota cuaca.<br>Diambil ${esc(fmtTime(data.fetchedAt ?? null))}</p>`;
    } catch {
      el("bio-summary").innerHTML =
        '<p class="muted">Statistik biodiversitas tidak dapat diambil.</p>';
    }
  }
  return {
    air,
    refresh: async (city: string) => {
      await Promise.all([catalog(), biodiversity(), air(city)]);
    },
  };
}
