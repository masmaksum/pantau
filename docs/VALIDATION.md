# Hasil verifikasi v0.1

Pemeriksaan dilakukan pada 10 November 2026 (WIB), Node.js 24.22.1.

| Pemeriksaan                               | Hasil                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| `npm test`                                | 17 tes lulus, 0 gagal; tidak memakai jaringan upstream          |
| `npm run build`                           | TypeScript dan build Vite produksi berhasil                     |
| `npm run smoke`                           | API HTTP, frontend hasil build, RSS, BMKG, dan cuaca berhasil   |
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

## Pembaruan v0.1.1 — pengecualian topik

- 22 tes lulus, termasuk pengecualian empat topik, laporan campuran, kategori RSS/Atom, dan API yang membaca cache lama.
- Build produksi berhasil.
- Smoke upstream: ANTARA 41 item yang lolos, detik 87, BMKG 15; 129 laporan berada dalam rentang 24 jam dan empat memiliki lokasi. Open-Meteo berhasil. Jumlah berubah mengikuti feed.
- Pemeriksaan browser tetap belum dilakukan; perubahan antarmuka memakai kebijakan bersama dengan backend untuk menyaring daftar/peta/ekspor.

## Pembaruan v0.1.2 — sumber lingkungan dari riset Mandum Rimba

- 29 tes lulus, mencakup parser model udara, statistik GBIF, validasi GeoJSON dan path berkas, batas pemotongan, tanggal satelit, kontrol akses API, status konfigurasi, dan impor berkas operator.
- Build produksi berhasil. Bundle utama sekitar 186 kB sebelum gzip; HLS tetap dimuat terpisah ketika dibutuhkan.
- Smoke lingkungan berhasil: CAMS/Open-Meteo, GBIF (3.056.688 catatan `PRESENT` Indonesia pada saat pemeriksaan), GFW true-color PNG (56.619 byte), NASA MODIS JPEG (18.013 byte), NASA NOAA-20 hotspot PNG (3.112 byte). Signature gambar diperiksa; tanggal raster NASA yang diuji 8 November 2026 UTC.
- Ditemukan respons NASA SNPP HTTP 200 berisi XML ServiceException untuk tanggal yang diuji. Produk default dipilih NOAA-20 dan indikator tile-error tersedia; data kosong tidak dinyatakan sebagai nol kejadian.
- Smoke laporan lama tetap lulus dengan pembatasan topik; hasil saat pemeriksaan 126 laporan dalam 24 jam, lima berlokasi. Ini bukan angka tetap.
- Basemap Esri dark dan referensi label diuji sebagai gambar valid; rendering browser masih belum diverifikasi.
- Vektor GFW belum diuji live tanpa key. Uji impor GeoJSON menggunakan fixture lokal, bukan klaim dataset mangrove/bencana asli sudah diimpor. WDPA/GADM/IUCN resmi tidak disalin, Trase dikecualikan.
- Perbandingan visual bersumber dari screenshot resmi dalam repo Mandum; tidak mengklaim pemeriksaan browser produksi atau pengujian UI interaktif telah dilakukan.

## Pembaruan v0.1.3 — pemantauan HAM

- Lima kategori pemantauan: kekerasan aparat, represi aktivis, kekerasan ormas terhadap warga sipil, persekusi, dan HAM lainnya.
- Konteks HAM dalam judul/ringkasan diprioritaskan atas pengecualian kriminal/transportasi/ekonomi/selebritis. Kriminal umum tetap dikecualikan. Metadata kategori saja tidak cukup untuk melewati penyaringan.
- Cache lama diklasifikasi ulang saat disajikan. Laporan yang sudah tidak tersimpan akibat kebijakan sebelumnya hanya dapat muncul bila masih tersedia dalam pengambilan feed berikutnya; tidak ada pemulihan arsip yang tidak dimiliki.
- 34 tes lulus, termasuk pemisahan penindakan kriminal biasa dari konteks kekerasan aparat, laporan HAM yang memuat kata topik terlarang, konteks dalam ringkasan, dan penyajian cache lama melalui API.
- Build dan smoke upstream lulus. Hasil smoke saat pemeriksaan: 127 laporan dalam 24 jam; jumlah berubah mengikuti sumber.
- Judul, ringkasan, sumber, dugaan, bantahan, dan status `reported` dipertahankan. Label HAM adalah kategori pemantauan heuristik, bukan verifikasi tuduhan atau putusan pelanggaran.
- Sumber feed tidak berubah. Kategori tambahan tidak menjamin cakupan lengkap isu HAM. Pengujian visual browser belum dilakukan.

## Pembaruan v0.1.4 — persiapan jalur sosial resmi

- Lima kanal disiapkan: X API v2, Threads API, Instagram API, Facebook Pages API, TikTok Display API.
- Seluruh placeholder credential/target dalam `.env.example` kosong. OAuth, collector live, dan aktivasi belum diimplementasikan. Token terisi hanya mengubah tahap menjadi `implementation_pending`, tidak memulai request.
- Adapter RSS sosial dan contoh konfigurasinya dihapus; `SOCIAL_CONFIG` dan cache RSS sosial tidak dipakai. RSS berita tetap dipakai.
- 39 tes lulus, termasuk status kelima provider, placeholder kosong, tidak bocornya credential/ID/query, prioritas HAM dalam normalisasi fixture, validasi permalink/timestamp, proteksi API status, dan pencegahan masuknya cache RSS sosial lama.
- Build produksi dan smoke berita/BMKG/cuaca berhasil. Kelima sumber sosial pada smoke berstatus `unconfigured`, `count: 0`, tanpa waktu pengambilan.
- Tidak ada panggilan live ke API platform sosial. Hasil tes fixture bukan bukti akses API atau review izin telah berhasil. Pengujian visual browser tetap belum dilakukan.
