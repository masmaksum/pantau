import type { PreservedArticle } from "../shared/archive.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const statusLabel: Record<string, string> = {
  queued: "Menunggu pengambilan",
  running: "Sedang diambil",
  retry: "Menunggu percobaan ulang",
  complete: "Berhasil diekstrak",
  partial: "Tersimpan sebagian",
  unavailable: "Tidak berhasil diambil",
};
function save(blob: Blob, filename: string) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export function renderPreservedContent(
  container: HTMLElement,
  articleId: string,
  preserved: PreservedArticle,
  assetApi: (path: string) => Promise<Blob>,
  formatTime: (s: string | null) => string,
) {
  let disposed = false;
  const objectUrls: string[] = [];
  const base = `/api/archive/${encodeURIComponent(articleId)}/captures/`;
  container.innerHTML = `<h3>Teks lengkap & foto tersimpan</h3><p class="muted">Hasil pengambilan halaman penerbit pada waktu tercatat. Status sebagian berarti ada teks, halaman, atau foto yang belum berhasil disimpan. Caption dan kredit foto mengikuti penerbit.</p><ul class="capture-jobs">${preserved.jobs.map((j) => `<li>Versi feed ${j.revision}: ${esc(statusLabel[j.status])} · percobaan ${j.attempts}${j.message ? `<br>${esc(j.message)}` : ""}${j.status === "retry" ? ` · berikutnya ${esc(formatTime(j.nextAttemptAt))}` : ""}</li>`).join("")}</ul>${preserved.captures.length ? "" : "<p>Belum ada salinan halaman. Pengambilan berjalan di latar belakang saat server aktif; buka kembali detail untuk memperbarui status.</p>"}${[
    ...preserved.captures,
  ]
    .reverse()
    .map(
      (c, i) =>
        `<details class="preserved-capture" data-capture="${c.id}" ${i === 0 ? "open" : ""}><summary>${esc(formatTime(c.capturedAt))} · ${esc(statusLabel[c.status])} · versi feed ${c.revision}</summary><h4>${esc(c.title)}</h4>${c.byline ? `<p>${esc(c.byline)}</p>` : ""}${c.warnings.length ? `<p class="capture-warning">${c.warnings.map(esc).join("<br>")}</p>` : ""}<div class="preserved-text">${
          c.text
            .split(/\n\n/)
            .map((p) => `<p>${esc(p)}</p>`)
            .join("") ||
          "<p>Teks utama belum berhasil diekstrak; HTML yang diterima tersedia untuk diunduh.</p>"
        }</div><div class="preserved-photos">${c.photos.map((p, n) => `<figure>${p.assetHash ? `<img data-photo="${n}" alt="${esc(p.alt || "Foto artikel tersimpan")}" /><p data-photo-state="${n}" role="status">Memuat foto tersimpan…</p>` : `<p>Foto belum tersimpan: ${esc(p.error)}</p>`}<figcaption>${esc(p.caption || "Caption tidak tersedia dari penerbit.")}</figcaption>${p.alt ? `<small>Alt: ${esc(p.alt)}</small>` : ""}<small>Asal foto: ${esc(p.sourceUrl)}</small>${p.assetHash ? `<button class="text-button" data-photo-download="${n}">↓ Unduh foto tersimpan</button>` : ""}</figure>`).join("")}</div><div class="layer-actions"><button class="outline-button" data-text>↓ Teks artikel</button><button class="text-button" data-json>↓ Metadata snapshot JSON</button>${c.pages.map((p, n) => `<button class="text-button" data-html="${n}">↓ HTML halaman ${n + 1}</button>`).join("")}</div><small>Diambil dari ${c.pages.map((p) => esc(p.url)).join(", ")}<br>Extractor: ${esc(c.extractor)} · Hash: <code>${c.contentHash}</code></small></details>`,
    )
    .join("")}`;
  container
    .querySelectorAll<HTMLDetailsElement>("[data-capture]")
    .forEach((section) => {
      const capture = preserved.captures.find(
        (c) => c.id === section.dataset.capture,
      )!;
      const path = (hash: string) => `${base}${capture.id}/assets/${hash}`;
      let loaded = false;
      const load = () => {
        if (!section.open || loaded) return;
        loaded = true;
        section
          .querySelectorAll<HTMLImageElement>("[data-photo]")
          .forEach((img) => {
            const n = Number(img.dataset.photo),
              photo = capture.photos[n];
            void assetApi(path(photo.assetHash!))
              .then((blob) => {
                if (disposed) return;
                const u = URL.createObjectURL(blob);
                objectUrls.push(u);
                img.src = u;
                section.querySelector(`[data-photo-state="${n}"]`)?.remove();
              })
              .catch(() => {
                if (!disposed) {
                  const state = section.querySelector(
                    `[data-photo-state="${n}"]`,
                  );
                  if (state) state.textContent = "Foto tersimpan gagal dimuat.";
                }
              });
          });
      };
      section.ontoggle = load;
      load();
      section.querySelector<HTMLButtonElement>("[data-text]")!.onclick = () =>
        save(
          new Blob(
            [
              capture.title +
                "\n" +
                (capture.byline || "") +
                "\n\n" +
                capture.text +
                "\n\n" +
                capture.photos.map((p) => p.caption || "").join("\n"),
            ],
            { type: "text/plain;charset=utf-8" },
          ),
          `pantau-${articleId}.txt`,
        );
      section.querySelector<HTMLButtonElement>("[data-json]")!.onclick = () =>
        save(
          new Blob([JSON.stringify(capture, null, 2)], {
            type: "application/json",
          }),
          `pantau-${capture.id}.json`,
        );
      const bindDownload = (selector: string, kind: "html" | "photo") =>
        section.querySelectorAll<HTMLButtonElement>(selector).forEach((b) => {
          b.onclick = async () => {
            const n = Number(
              kind === "html" ? b.dataset.html : b.dataset.photoDownload,
            );
            const hash =
              kind === "html"
                ? capture.pages[n].htmlHash
                : capture.photos[n].assetHash!;
            try {
              save(
                await assetApi(path(hash)),
                `${hash}.${kind === "html" ? "html" : capture.photos[n].mime!.split("/")[1]}`,
              );
            } catch {
              b.textContent = "Unduhan gagal";
            }
          };
        });
      bindDownload("[data-html]", "html");
      bindDownload("[data-photo-download]", "photo");
    });
  return () => {
    disposed = true;
    objectUrls.forEach((u) => URL.revokeObjectURL(u));
  };
}
