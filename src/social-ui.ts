import type { OfficialSocialState } from "../shared/social.js";

type Api = <T>(path: string, signal?: AbortSignal) => Promise<T>;
const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function mountOfficialSocial(api: Api) {
  const section = document.createElement("section");
  section.className = "social-monitoring";
  section.id = "social-monitoring";
  section.innerHTML = `<div class="social-heading"><div><div class="eyebrow">MONITORING MEDIA SOSIAL / API RESMI</div><h2>Lima kanal, sumber yang jelas.</h2></div><span class="small-tag">BELUM DIAKTIFKAN</span></div><p class="muted">X, Threads, Instagram, Facebook, dan TikTok disiapkan melalui API resmi. Akses dan izin akan dikonfigurasi saat implementasi.</p><label class="social-filter">Platform<select id="social-platform"><option value="all">Semua platform</option><option value="x">X</option><option value="threads">Threads</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option></select></label><div id="social-providers" class="social-grid"><p class="muted">Memeriksa kesiapan kanal…</p></div><p class="social-footnote">Seluruh kanal belum mengambil unggahan. Tampilan kosong di sini tidak berarti tidak ada laporan di platform.</p>`;
  document.getElementById("social-content")!.append(section);
  const filter = () => {
    const selected = (
      document.getElementById("social-platform") as HTMLSelectElement
    ).value;
    section.querySelectorAll<HTMLElement>("[data-platform]").forEach((card) => {
      card.hidden = selected !== "all" && card.dataset.platform !== selected;
    });
  };
  document.getElementById("social-platform")!.onchange = filter;
  let generation = 0;
  return {
    refresh: async () => {
      const sequence = ++generation;
      try {
        const data = await api<{
          policy: string;
          providers: OfficialSocialState[];
        }>("/api/social/providers");
        if (sequence !== generation) return;
        const container = document.getElementById("social-providers")!;
        container.innerHTML = data.providers
          .map(
            (p) =>
              `<article class="social-provider" data-platform="${escape(p.platform)}"><div class="panel-title"><span>${escape(p.name)}</span><span class="status-dot"></span></div><h3>${p.stage === "configuration_missing" ? "Belum dikonfigurasi" : "Menunggu implementasi"}</h3><p>${escape(p.scope)}</p><small>${escape(p.message)}</small><a href="${escape(p.documentation)}" target="_blank" rel="noopener noreferrer">Dokumentasi resmi ↗</a></article>`,
          )
          .join("");
        filter();
      } catch {
        if (sequence === generation)
          document.getElementById("social-providers")!.textContent =
            "Status kanal tidak dapat diperiksa. Belum ada data sosial yang ditampilkan.";
      }
    },
  };
}
