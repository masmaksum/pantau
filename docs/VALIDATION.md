# Hasil verifikasi v0.1

Pemeriksaan dilakukan pada 10 November 2026 (WIB), Node.js 24.22.1.

| Pemeriksaan | Hasil |
| --- | --- |
| `npm test` | 17 tes lulus, 0 gagal; tidak memakai jaringan upstream |
| `npm run build` | TypeScript dan build Vite produksi berhasil |
| `npm run smoke` | API HTTP, frontend hasil build, RSS, BMKG, dan cuaca berhasil |
| `npm audit --omit=dev --audit-level=high` | 0 kerentanan dependensi produksi terlapor pada saat pemeriksaan |

Hasil smoke live terakhir:

```text
antara: ok, 50 items
detik: ok, 100 items
bmkg: ok, 15 items
firms: unconfigured
social: unconfigured
151 reports in 24h; 7 with locations
Open-Meteo: HTTP 200, ok
Live HTTP smoke passed.
```

Jumlah item dan hasil upstream berubah seiring waktu. Data RSS yang tersedia tidak selalu mencakup seluruh rentang waktu yang dipilih. Hanya tujuh laporan cocok dengan geolokasi terbatas pada saat smoke test; laporan tanpa lokasi tetap dapat dibaca dalam daftar.

Build memisahkan pemutar HLS menjadi chunk yang baru diunduh saat kamera HLS dibuka. Bundle utama sekitar 172,5 kB sebelum gzip (52,5 kB gzip); chunk HLS sekitar 596,7 kB (186,7 kB gzip). Vite memberi peringatan ukuran untuk chunk HLS; build tetap berhasil.

Yang **belum diverifikasi**:

- Rendering visual, navigasi keyboard, interaksi peta, dan ekspor unduhan di browser nyata. Tool browser bersama tidak tersedia pada sesi ini; tidak dilakukan pemasangan jalur browser alternatif.
- Playback CCTV HLS dan pengambilan feed sosial operator; belum ada sumber yang dikonfigurasi.
- NASA FIRMS live; MAP_KEY tidak diberikan. Parser CSV dan semantik piksel diuji dengan fixture.
- Deployment pada Railway/host lain, skala produksi, dan ketahanan multi-replika. Repositori berisi kode dan petunjuk, belum deployment.
- Kesetaraan seluruh fitur SITREP atau validitas faktual setiap berita. Kategori/geolokasi berita masih heuristik.

Saat pemeriksaan awal, klien Python menerima HTTP 403 dari BMKG; klien aplikasi kemudian berhasil mengambil feed yang sama. Status sumber dan waktu pengambilan pada instans yang dijalankan pengguna tetap menjadi acuan, bukan hasil sesi ini.
