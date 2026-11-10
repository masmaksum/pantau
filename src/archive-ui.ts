import L from "leaflet";
import type { Category } from "../shared/types.js";
import type {
  ArchiveHealth,
  ArchivePage,
  ArchivedArticle,
  ArchiveVersion,
} from "../shared/archive.js";

type Api = <T>(path: string, signal?: AbortSignal) => Promise<T>;
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
function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountNewsArchive(
  api: Api,
  formatTime: (s: string | null) => string,
  labels: Record<Category, string>,
  map: L.Map,
) {
  const button = document.createElement("button");
  button.className = "tab archive-tab";
  button.innerHTML = "03 <span>Arsip berita</span>";
  document.querySelector(".topbar-end")!.before(button);
  const dialog = document.createElement("dialog");
  dialog.id = "archive-dialog";
  dialog.innerHTML = `<button class="dialog-close" id="close-archive" aria-label="Tutup arsip">×</button><div class="eyebrow">PRESERVASI BERITA / SNAPSHOT SAAT MASUK</div><h2>Berita tetap dapat ditelusuri.</h2><p id="archive-health" role="status">Memeriksa arsip…</p><form id="archive-filter" class="archive-filter"><label>Cari judul / ringkasan<input type="search" id="archive-q" maxlength="200" placeholder="Kata kunci…" /></label><label>Kanal<select id="archive-source"><option value="">Semua kanal</option></select></label><label>Kategori awal<select id="archive-category"><option value="">Semua kategori</option></select></label><label>Lokasi saat masuk<input id="archive-location" maxlength="200" placeholder="Nama wilayah…" /></label><label>Tanggal masuk dari (WIB)<input type="date" id="archive-from" /></label><label>Sampai (WIB)<input type="date" id="archive-to" /></label><label>Ketersediaan lokasi<select id="archive-located"><option value="">Semua</option><option value="yes">Memiliki lokasi</option><option value="no">Lokasi belum diketahui</option></select></label><button class="solid-button" type="submit">Cari arsip</button></form><p class="archive-caption">Filter memakai snapshot awal dan tanggal masuk arsip, bukan waktu publikasi. Perubahan berita tersedia dalam riwayat versi. Lokasi perkiraan tetap diberi label.</p><div id="archive-results"></div><div class="archive-pagination"><button id="archive-prev" class="outline-button" disabled>← Sebelumnya</button><span id="archive-page">—</span><button id="archive-next" class="outline-button" disabled>Berikutnya →</button><button id="archive-export" class="text-button" disabled>↓ Ekspor halaman JSON</button></div>`;
  const detail = document.createElement("dialog");
  detail.id = "archive-detail";
  detail.innerHTML =
    '<button class="dialog-close" id="close-archive-detail" aria-label="Tutup detail arsip">×</button><div id="archive-detail-content"></div>';
  document.body.append(dialog, detail);
  el("close-archive").onclick = () => dialog.close();
  el("close-archive-detail").onclick = () => detail.close();
  let page: ArchivePage | null = null;
  let offset = 0;
  let request = 0;
  let marker: L.CircleMarker | null = null;
  const categoryLabel = (s: string) => labels[s as Category] ?? s;
  const locationLabel = (v: ArchiveVersion) => {
    const l = v.criteria.locationAtEntry;
    if (!l) return "Lokasi belum diketahui";
    return `${l.name} · ${{ city: "perkiraan pusat kota/wilayah", province: "perkiraan provinsi", epicenter: "episentrum", "satellite-pixel": "piksel satelit" }[l.precision]}`;
  };
  async function health() {
    const value = await api<
      ArchiveHealth & {
        sources: { id: string; name: string }[];
        categories: { id: string }[];
      }
    >("/api/archive/status");
    el("archive-health").textContent =
      `${value.articles} berita tersimpan · ${value.revisions} versi${value.status === "error" ? ` · ${value.message}` : ""}`;
    const source = el<HTMLSelectElement>("archive-source"),
      category = el<HTMLSelectElement>("archive-category");
    const oldSource = source.value,
      oldCategory = category.value;
    source.innerHTML =
      '<option value="">Semua kanal</option>' +
      value.sources
        .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`)
        .join("");
    source.value = oldSource;
    category.innerHTML =
      '<option value="">Semua kategori</option>' +
      value.categories
        .map(
          (s) =>
            `<option value="${esc(s.id)}">${esc(categoryLabel(s.id))}</option>`,
        )
        .join("");
    category.value = oldCategory;
  }
  async function load() {
    const sequence = ++request;
    const q = new URLSearchParams({ limit: "25", offset: String(offset) });
    for (const key of [
      "q",
      "source",
      "category",
      "location",
      "from",
      "to",
      "located",
    ]) {
      const value = (el(`archive-${key}`) as HTMLInputElement).value.trim();
      if (value) q.set(key, value);
    }
    el("archive-results").setAttribute("aria-busy", "true");
    try {
      const result = await api<ArchivePage>(`/api/archive?${q}`);
      if (sequence !== request) return;
      page = result;
      el("archive-results").innerHTML = result.items.length
        ? `<div class="archive-table-wrap"><table class="archive-table"><thead><tr><th>Snapshot berita awal</th><th>Kanal / kategori awal</th><th>Lokasi awal</th><th>Masuk arsip (WIB)</th><th>Versi</th></tr></thead><tbody>${result.items.map((a) => `<tr><td><button class="event-title" data-archive-id="${a.id}">${esc(a.initial.event.title)}</button><small>Publikasi: ${esc(formatTime(a.initial.event.publishedAt))}</small></td><td>${esc(a.sourceName)}<small>${esc(categoryLabel(a.initial.criteria.categoryAtEntry))}</small></td><td>${esc(locationLabel(a.initial))}</td><td>${esc(formatTime(a.firstArchivedAt))}</td><td>${a.revisionCount}</td></tr>`).join("")}</tbody></table></div>`
        : '<p class="muted">Belum ada arsip yang cocok. Berita disimpan saat diterima server; arsip tidak mengisi masa lalu yang belum pernah diambil.</p>';
      el("archive-page").textContent =
        `${result.total ? offset + 1 : 0}–${offset + result.items.length} / ${result.total} berita`;
      el<HTMLButtonElement>("archive-prev").disabled = offset === 0;
      el<HTMLButtonElement>("archive-next").disabled =
        offset + result.items.length >= result.total;
      el<HTMLButtonElement>("archive-export").disabled = !result.items.length;
      el("archive-results")
        .querySelectorAll<HTMLButtonElement>("[data-archive-id]")
        .forEach(
          (b) =>
            (b.onclick = () => {
              void openDetail(b.dataset.archiveId!);
            }),
        );
    } catch (e) {
      if (sequence !== request) return;
      page = null;
      el<HTMLButtonElement>("archive-export").disabled = true;
      el("archive-results").textContent =
        e instanceof Error ? e.message : "Arsip gagal diambil";
    } finally {
      if (sequence === request)
        el("archive-results").removeAttribute("aria-busy");
    }
  }
  async function openDetail(id: string) {
    detail.showModal();
    el("archive-detail-content").textContent = "Mengambil riwayat berita…";
    try {
      const item = await api<ArchivedArticle & { versions: ArchiveVersion[] }>(
        `/api/archive/${encodeURIComponent(id)}`,
      );
      if (!detail.open) return;
      el("archive-detail-content").innerHTML =
        `<div class="eyebrow">ARSIP / ${esc(item.sourceName)}</div><h2>${esc(item.initial.event.title)}</h2><p>Snapshot pertama: ${esc(formatTime(item.firstArchivedAt))}<br>Terakhir terlihat dalam feed: ${esc(formatTime(item.lastObservedAt))}</p><p class="muted">Konten yang tersimpan adalah judul dan ringkasan RSS yang diterima, bukan salinan teks lengkap halaman artikel. Klasifikasi dan dugaan mengikuti sumber serta aturan saat masuk.</p>${item.versions.map((v) => `<section class="archive-version"><div class="panel-title"><span>VERSI ${v.sequence}</span><span>${esc(formatTime(v.archivedAt))}</span></div><h3>${esc(v.event.title)}</h3><p>${esc(v.event.summary || "Ringkasan tidak tersedia.")}</p><dl><dt>Kategori saat masuk versi</dt><dd>${esc(categoryLabel(v.criteria.categoryAtEntry))}</dd><dt>Lokasi tersimpan</dt><dd>${esc(locationLabel(v))}${v.event.location ? `<br>${v.event.location.lat}, ${v.event.location.lon} · ${esc(v.event.location.method)}` : ""}</dd><dt>Publikasi sumber</dt><dd>${esc(formatTime(v.event.publishedAt))}</dd><dt>Pengambilan sumber</dt><dd>${esc(formatTime(v.sourceFetchedAt))}</dd><dt>Asal snapshot</dt><dd>${v.acquisition === "last-good-cache" ? "Cache terakhir · sumber sedang gagal" : "Snapshot feed"}</dd><dt>Aturan seleksi</dt><dd>${esc(v.criteria.policyVersion)}<br><code>${esc(v.criteria.policyFingerprint)}</code></dd><dt>Hash konten</dt><dd><code>${esc(v.contentHash)}</code></dd></dl><button class="text-button" data-policy="${v.criteria.policyFingerprint}">↓ Snapshot aturan JSON</button></section>`).join("")}<div class="layer-actions"><a class="solid-button" href="${esc(item.initial.event.url)}" target="_blank" rel="noopener noreferrer">Buka sumber asli ↗</a>${item.initial.event.location ? '<button id="archive-map" class="outline-button">Lihat lokasi awal di peta</button>' : ""}</div>`;
      el("archive-detail-content")
        .querySelectorAll<HTMLButtonElement>("[data-policy]")
        .forEach(
          (b) =>
            (b.onclick = async () => {
              try {
                download(
                  await api(`/api/archive/policies/${b.dataset.policy}`),
                  `pantau-policy-${b.dataset.policy!.slice(0, 12)}.json`,
                );
              } catch {
                b.textContent = "Snapshot aturan gagal diambil";
              }
            }),
        );
      if (item.initial.event.location)
        el("archive-map").onclick = () => {
          detail.close();
          dialog.close();
          const l = item.initial.event.location!;
          if (marker) map.removeLayer(marker);
          const popup = document.createElement("div");
          const title = document.createElement("strong");
          title.textContent = `ARSIP: ${item.initial.event.title}`;
          const p = document.createElement("p");
          p.textContent = `${locationLabel(item.initial)} · diarsipkan ${formatTime(item.firstArchivedAt)}`;
          const remove = document.createElement("button");
          remove.textContent = "Hapus titik arsip";
          remove.onclick = () => {
            if (marker) map.removeLayer(marker);
            marker = null;
          };
          popup.append(title, p, remove);
          marker = L.circleMarker([l.lat, l.lon], {
            radius: 10,
            color: "#d5df97",
            weight: 3,
          })
            .addTo(map)
            .bindPopup(popup)
            .openPopup();
          map.flyTo([l.lat, l.lon], 8);
        };
    } catch {
      el("archive-detail-content").textContent = "Detail arsip gagal diambil.";
    }
  }
  button.onclick = () => {
    dialog.showModal();
    offset = 0;
    void health().catch(() => {
      el("archive-health").textContent =
        "Kesehatan arsip tidak dapat diperiksa.";
    });
    void load();
  };
  el("archive-filter").onsubmit = (e) => {
    e.preventDefault();
    offset = 0;
    void load();
  };
  el("archive-prev").onclick = () => {
    offset = Math.max(0, offset - 25);
    void load();
  };
  el("archive-next").onclick = () => {
    offset += 25;
    void load();
  };
  el("archive-export").onclick = () => {
    if (page)
      download(
        {
          exportedAt: new Date().toISOString(),
          selection: "Current archive page; initial snapshots",
          ...page,
        },
        "pantau-arsip-halaman.json",
      );
  };
}
