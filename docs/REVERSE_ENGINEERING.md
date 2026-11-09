# Rekonstruksi SITREP → PANTAU

Tanggal pemeriksaan: **10 November 2026 (WIB)**. Target referensi: `https://sitrep-production.up.railway.app/`.

## Tujuan dan ruang lingkup

Merekonstruksi fungsi dashboard pemantauan Indonesia dalam implementasi baru yang dapat dipelajari, dijalankan, dan dikembangkan oleh pemilik repositori. Pemeriksaan dibatasi pada HTML dan JavaScript yang sengaja dikirim ke browser publik. Tidak ada backend asli yang dipulihkan, login yang dilewati, pemindaian berkas privat, atau kredensial yang diambil/digunakan.

Kode SITREP tidak diikutsertakan dalam repo ini. Dokumentasi mencatat perilaku, nama jalur API yang terlihat, serta dependensi publik sebagai bukti pengamatan. Nama jalur yang terlihat tidak membuktikan jalur tersebut berfungsi atau kontrak responsnya diketahui.

## Bukti pengamatan publik

- Judul halaman: `SITREP // LIVE · Indonesia OSINT`.
- Deskripsi halaman menyebut berita, X, CCTV, peta insiden, serta pemantauan demo, kebakaran, banjir, dan bencana.
- Antarmuka memiliki bagian situasi, pasar/IDX, sosial X/Threads, berita, CCTV regional, peta insiden, dan TV langsung.
- Teks antarmuka menyebut auto-sync 120 detik.
- Halaman memuat D3 7.9.0, hls.js 1.5.13, Leaflet 1.9.4, leaflet.heat 0.2.0, dan skrip lokal `signals.js`, `wxicons.js`, `wire-core.js`.
- Komentar frontend menyebut `server.js` dan pemisahan pengambilan data `/api/news`, `/api/x`, `/api/cams`, serta proksi HLS. Ini petunjuk nama backend, bukan akses ke source backend.
- Teks ketelitian pin membedakan centroid desa/kelurahan, pusat kabupaten/kota, perkiraan provinsi, dan perkiraan wilayah. Sebagian hasil kecamatan menggunakan pusat kabupaten/kota.
- Kode frontend memiliki pemanggilan SiPongi dengan FIRMS sebagai fallback. Ini pengamatan cabang kode; keberhasilan kedua upstream tidak diverifikasi.

Jalur API yang terlihat di kode halaman:

```text
/api/alerts       /api/bmkg-modelrun /api/breaking  /api/cams
/api/cctv         /api/closes        /api/desc      /api/disaster
/api/fires        /api/flights       /api/incidents /api/market
/api/news         /api/ping          /api/radar     /api/read
/api/ships        /api/sipongi       /api/situation /api/thq
/api/thread       /api/threads       /api/thumb     /api/tomtom
/api/transit      /api/weather       /api/wind      /api/x
/api/xq
```

Semua nama di atas berasal dari pengamatan frontend; **bukan endpoint PANTAU** kecuali dijelaskan dalam README. Respons endpoint target yang memerlukan token tidak direplikasi atau diambil. Pemeriksaan ini bukan audit keamanan atau audit penuh kualitas data SITREP.

## Inferensi arsitektur target

```text
RSS/API/sumber sosial → backend aggregator → respons JSON → frontend peta/dashboard
                                  ↘ proksi media/pembaca artikel (terlihat dari pemanggilan)
```

Inferensi: backend kemungkinan menyatukan format, memberi kategori/lokasi, dan membantu akses media lintas origin. Bahasa backend, database, pipeline LLM, autentikasi, jadwal ingestion, serta algoritma korelasi tidak dapat dipastikan dari antarmuka. Klaim pembuat mengenai penggunaan DeepSeek/Kimi tidak membuktikan model tersebut berjalan di backend produksi.

## Implementasi pengganti

```text
ANTARA/detik RSS ── parse RSS/Atom ── klasifikasi + gazetteer judul ─┐
BMKG JSON ──────── normalisasi gempa resmi ────────────────────────┤
NASA FIRMS CSV ─── normalisasi piksel termal (key operator) ───────┤
RSS sosial ─────── konfigurasi operator ──────────────────────────┤
                                                                 ↓
                            cache per sumber + snapshot terakhir yang berhasil
                                                                 ↓
                            API situation → filter waktu → UI / ekspor GeoJSON

Open-Meteo ── cache per kota → API weather → kartu prakiraan
Konfigurasi kamera ── API cameras → HLS langsung di browser / tautan sumber
```

Desain baru menggunakan TypeScript, Express, Vite, Leaflet, dan hls.js. Tidak mencoba memakai respons privat, service pihak target, AI harness, atau branding target. Pemisahan adapter, kontrak `Event`, dan status sumber memudahkan penambahan provider nanti.

Keputusan yang disengaja:

1. **Tidak membuat geolokasi yang tampak pasti.** Pencocokan hanya satu tempat dikenal di judul. Judul dengan beberapa tempat tidak diberi pin; keterbatasan cakupan ditampilkan.
2. **Tidak menyamakan artikel dengan kejadian.** Deduplikasi berbasis URL penerbit; tidak ada korelasi lintas penerbit atau skor kepercayaan palsu.
3. **Tidak menyalin pembaca artikel penuh.** Simpan ringkasan RSS dan buka sumber asli. Pengambilan artikel penuh memerlukan pertimbangan hak konten dan adapter penerbit.
4. **Tidak menyembunyikan gangguan upstream.** Bedakan `ok`, `stale`, `error`, dan `unconfigured` beserta waktu pengambilan terakhir.
5. **Tidak meniru feed sosial yang belum tersedia.** Operator memasang feed resmi/berizin; status default belum dikonfigurasi.
6. **Tidak memproksikan kamera.** Playback langsung memerlukan CORS dan izin sumber. Key API tidak dikirim ke browser.

## Matriks kesetaraan

| Kemampuan target yang terlihat                | PANTAU v0.1                                                 |
| --------------------------------------------- | ----------------------------------------------------------- |
| Berita dalam dashboard                        | RSS dan ringkasan, tautan artikel asli                      |
| Geolokasi otomatis                            | Gazetteer judul terbatas, label perkiraan                   |
| Peta insiden                                  | Leaflet, kategori, pin gabungan pada koordinat sama, detail |
| Pembaruan otomatis                            | Poll 120 detik, TTL per provider                            |
| Gempa BMKG                                    | Adapter JSON; akses live tergantung upstream                |
| Hotspot                                       | FIRMS opsional; SiPongi belum                               |
| Cuaca                                         | Open-Meteo per kota; radar/angin belum                      |
| Sosial X/Threads                              | Adapter RSS operator; integrasi native belum                |
| CCTV regional                                 | Konfigurasi HLS/link; katalog otomatis belum                |
| MAGMA, AQMS, TomTom, ADS-B, AIS, BJKT, market | Belum diimplementasikan                                     |
| Globe, heatmap, TV, pembaca artikel           | Belum diimplementasikan                                     |
| AI / korelasi kejadian                        | Belum diimplementasikan                                     |

## Verifikasi dan keterbatasan

Unit tests memeriksa parser RSS/Atom, timestamp, batas koordinat, label ketelitian, URL aman, deduplikasi, cache last-good saat kegagalan/restart, backoff, dan kontrol API. Smoke test menjalankan aplikasi HTTP dengan provider nyata. Hasil awal dan perintah dapat dilihat dalam README dan `docs/VALIDATION.md`.

Pengambilan live melalui klien aplikasi berhasil untuk ANTARA (50 item), detik (100 item), BMKG (15 item), dan Open-Meteo. Pemeriksaan awal dengan klien Python menerima HTTP 403 dari BMKG; klien aplikasi kemudian berhasil, sehingga akses mungkin bergantung pada kebijakan sumber dan karakteristik klien. Tidak ada token SITREP atau kredensial pihak ketiga yang dipakai. NASA FIRMS belum dipanggil karena key tidak tersedia. CCTV dan feed sosial belum dikonfigurasi.

Tool browser bersama tidak tersedia pada sesi implementasi. Mengikuti panduan lingkungan, tidak dipasang jalur kontrol browser alternatif. Karena itu pemeriksaan visual, interaksi peta di browser, dan playback HLS belum diverifikasi. Ini tetap menjadi pekerjaan validasi setelah checkout.

## Pengembangan berikutnya

Prioritas: validasi UI browser desktop/mobile; uji provider BMKG dari host deployment; perluas gazetteer memakai data wilayah berlisensi jelas; tambahkan first-seen store dan klaster kejadian dengan jejak bukti; tambahkan provider sosial, MAGMA/SiPongi/AQMS hanya setelah kontrak dan izin sumber jelas. Adapter transportasi dan ringkasan AI dapat ditambahkan sebagai modul terpisah dengan key milik operator.

## Pembaruan kebijakan topik v0.1.1

Atas permintaan pemilik, PANTAU mengecualikan kriminal, transportasi, ekonomi, dan selebritis. Penyaringan baru diterapkan pada judul/ringkasan/kategori RSS-Atom, diperiksa ulang untuk cache lama dan tampilan, serta didahulukan atas kategori positif pada laporan campuran. Kriminal/transportasi tidak lagi menjadi pilihan filter. Ini keputusan editorial PANTAU, bukan fitur yang disimpulkan dari SITREP.
