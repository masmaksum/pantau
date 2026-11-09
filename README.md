# PANTAU

**Ruang pantau sumber terbuka Indonesia.** Berita, peta laporan, gempa, cuaca, dan hotspot opsional dalam satu dashboard berbahasa Indonesia.

PANTAU adalah implementasi mandiri berdasarkan pengamatan antarmuka publik [SITREP Indonesia](https://sitrep-production.up.railway.app/), dibuat untuk `masmaksum/pantau`. Ini **bukan source code backend asli**, bukan proyek resmi SITREP, dan belum memiliki kesetaraan seluruh fitur. Kode, desain, dan pipeline dalam repositori ini ditulis baru; tidak menyalin aset atau source frontend SITREP. Lihat [laporan reverse engineering](docs/REVERSE_ENGINEERING.md) untuk bukti pengamatan, asumsi, dan perbedaan implementasi.

## Menjalankan

Persyaratan: Node.js 22 atau lebih baru dan npm. Verifikasi awal dilakukan pada Node.js 24.

```sh
npm ci
cp .env.example .env
npm run build
npm start
```

Buka **http://127.0.0.1:3000**. Server Express menyajikan API dan hasil build Vite pada origin yang sama. Perintah dijalankan dari root repositori. Tanpa API key, berita dan cuaca sudah dapat digunakan; gempa bergantung pada akses BMKG dari jaringan server.

Untuk mengembangkan antarmuka dengan hot reload, jalankan dua terminal:

```sh
# Terminal 1: backend, port 3000
npm run dev

# Terminal 2: frontend, port 5173; /api diproksikan ke backend
npm run dev:web
```

Untuk Railway atau server lain: build `npm ci && npm run build`, start `npm start`, set `HOST=0.0.0.0`, dan gunakan `PORT` yang diberikan platform. Health check: `/healthz`. Tidak diperlukan database. `.cache/` boleh ditempatkan pada volume persisten; tanpa volume, cache hilang ketika instance diganti. Cache/coalescing berlaku per proses, bukan antar-replika.

## Yang sudah diimplementasikan

- Dashboard responsif dengan peta Leaflet, daftar laporan, detail kejadian, dan kondisi sumber.
- RSS ANTARA dan detikNews; ringkasan hanya jika tersedia dalam RSS, dengan tautan penerbit asli.
- Pengelompokan kata kunci: gempa, banjir/longsor, kebakaran, demo, kriminal, politik, transportasi, lainnya.
- Pencocokan judul ke gazetteer kota/provinsi terbatas. Lokasi ambigu tetap kosong. Setiap pin mencantumkan ketelitian dan metode penentuan lokasi.
- Gempa BMKG melalui data JSON resmi, dengan waktu, magnitudo, kedalaman, dan episentrum.
- Cuaca Open-Meteo per kota: suhu, hujan, angin, dan prakiraan tiga hari.
- Hotspot VIIRS NASA FIRMS jika operator mengisi `FIRMS_MAP_KEY`.
- Filter 6/24/72 jam, kategori, pencarian, dan hanya laporan berlokasi; pembaruan otomatis 120 detik.
- Ekspor GeoJSON untuk titik sesuai filter, termasuk sumber, timestamp, ketelitian, dan jumlah laporan yang tidak terpetakan.
- Cache terakhir yang berhasil, penanda data lama, jeda retry, dan penggabungan request bersamaan ke sumber yang sama.
- Konfigurasi CCTV HLS/tautan dan feed sosial RSS resmi/berizin. Tidak ada kamera atau posting sosial bawaan yang dibuat-buat.
- Token akses API opsional untuk instans yang memerlukannya.

## Integrasi dan status nyata

| Sumber        | Default                          | Status verifikasi awal                                                                            |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| ANTARA RSS    | Aktif                            | Pengambilan live berhasil                                                                         |
| detikNews RSS | Aktif                            | Pengambilan live berhasil                                                                         |
| BMKG gempa    | Aktif                            | Pengambilan live lewat aplikasi berhasil (15 item); pemeriksaan awal klien lain mendapat HTTP 403 |
| Open-Meteo    | Aktif                            | Pengambilan live berhasil                                                                         |
| NASA FIRMS    | Perlu MAP_KEY sendiri            | Parser diuji; panggilan live belum diuji tanpa key                                                |
| X / Threads   | Feed RSS berizin dari operator   | Belum dikonfigurasi; tidak ada scraping atau bypass login                                         |
| CCTV          | URL publik berizin dari operator | Belum dikonfigurasi; streaming end-to-end belum diuji                                             |

Sumber yang gagal tetap ditampilkan sebagai gagal. Server tidak menggunakan API, token, atau proxy milik SITREP. Jangan menganggap `HTTP 200` pada `/api/situation` berarti seluruh sumber berhasil; selalu periksa `sources[].status`.

**Belum diimplementasikan:** ringkasan AI/LLM, pembaca artikel lengkap, X/Threads API langsung, globe 3D, heatmap, MAGMA, SiPongi, AQMS, radar/angin, TomTom, ADS-B, AIS, BJKT, pasar/IDX, dan korelasi kejadian lintas sumber. Peta default menunjukkan titik, bukan batas dampak atau luasan kebakaran.

## Menambahkan sumber opsional

### NASA FIRMS

Daftarkan MAP_KEY sendiri di [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/), lalu isi `FIRMS_MAP_KEY` di `.env`. Server mengambil VIIRS SNPP NRT dalam kotak Indonesia untuk satu hari, setiap minimal 10 menit. Kotak koordinat mencakup wilayah negara tetangga; titik tidak dipotong menurut batas negara. Hasil dibatasi 2.000 titik untuk menjaga beban peta. Tidak ada key yang dikirim ke frontend.

### Kamera

Salin `config/cameras.example.json` ke `config/cameras.json`, lalu **ganti URL contoh** dengan URL yang operator berhak gunakan. `type: "hls"` memutar stream; `type: "link"` membuka halaman sumber. HLS dimuat langsung browser, sehingga server asal perlu HTTPS dan izin CORS yang sesuai. PANTAU tidak memproksikan video atau melewati pembatasan sumber. Ketersediaan stream ditampilkan setelah pengguna membukanya.

### Sosial

Salin `config/social.example.json` ke `config/social.json`, lalu ganti dengan feed RSS/Atom yang resmi atau berizin. Ini adapter RSS generik, bukan implementasi API X atau Threads. Batasi konfigurasi pada operator tepercaya: URL konfigurasi diambil oleh server. Jangan memberi pengunjung akses tulis ke konfigurasi. Gunakan ID feed yang unik dan stabil; jika URL sumber diubah, ubah ID atau hapus cache ID lama.

## Arti informasi

- **Laporan ≠ kejadian unik.** Deduplikasi hanya menggabungkan URL artikel penerbit yang sama setelah parameter tracking dihapus. Tidak ada klaim verifikasi independen dari jumlah artikel.
- **Pin berita ≠ alamat kejadian.** Pin berasal dari satu nama kota/provinsi yang dikenal dalam judul. Nama yang juga dapat berarti kabupaten atau provinsi tetap perkiraan. Daftar tempat terbatas ada di `server/domain.ts` dan belum cocok untuk keputusan lapangan.
- **Waktu publikasi ≠ waktu kejadian.** Rentang 6/24/72 jam menyaring waktu publikasi/akuisisi sumber. Laporan tanpa timestamp valid tidak masuk rentang. RSS mungkin hanya menyediakan item terbaru, sehingga memilih 72 jam tidak menjamin arsip 72 jam lengkap.
- **Hotspot ≠ kebakaran terkonfirmasi.** Titik adalah pusat piksel deteksi termal, bukan perimeter kebakaran, luas terbakar, atau penyebabnya.
- **Tidak ada titik ≠ tidak ada kejadian.** Cakupan dan gangguan sumber dapat menghasilkan kekosongan.
- **Cuaca adalah model.** Antarmuka menunjukkan waktu model dan waktu pengambilan, bukan mengklaim observasi stasiun.

Saat sumber gagal, data terakhir tetap memiliki `fetchedAt` lama dan status `stale`. Data tersebut masih disaring sesuai waktu publikasinya. Pengambilan sukses dengan hasil kosong menggantikan snapshot lama. Pengambilan gagal tidak menghapus snapshot lama atau membuat data simulasi. Nama “pertama dibaca dalam pengambilan ini” bukan catatan first-seen permanen per kejadian.

## API

| Endpoint                        | Isi                                                       |
| ------------------------------- | --------------------------------------------------------- |
| `GET /healthz`                  | Kesehatan proses, bukan kesehatan seluruh upstream        |
| `GET /api/situation?hours=24`   | `{ generatedAt, events, sources }`; hours hanya 6, 24, 72 |
| `GET /api/cities`               | Kota yang didukung prakiraan                              |
| `GET /api/weather?city=jakarta` | `{ value, fetchedAt, attemptedAt, status, message? }`     |
| `GET /api/cameras`              | Konfigurasi kamera dan status                             |

Jika `PANTAU_API_TOKEN` diisi, seluruh `/api/*` memerlukan `Authorization: Bearer <token>`. Pengguna bisa memasukkan token melalui tombol ⚙; disimpan di `sessionStorage` tab, bukan URL. Halaman statis dan `/healthz` tetap terbuka. Pakai HTTPS di depan instans dan batasi pengunjung sesuai kebutuhan. Tidak ada endpoint fetch URL arbitrer, upload, atau proksi artikel/video.

## Pemeriksaan

```sh
npm test           # parser, geolokasi, deduplikasi, cache/failure, kontrol API
npm run build     # TypeScript dan build produksi
npm run smoke     # smoke HTTP dengan upstream nyata; memerlukan jaringan dan build
```

Smoke test gagal jika tidak ada sumber live yang berisi data, jika cuaca tidak tersedia, atau frontend hasil build tidak tersaji. Kegagalan BMKG, jika terjadi, tetap dilaporkan sesuai kenyataan. Unit tests tidak membutuhkan jaringan eksternal. Pengujian browser visual belum dilakukan: tool browser bersama tidak tersedia pada lingkungan sesi implementasi. Build dan tes HTTP tidak membuktikan rendering peta atau playback HLS di semua browser.

## Struktur

```text
server/       Express, adapter sumber, cache, konfigurasi, domain
src/          Dashboard TypeScript, Leaflet, CSS, HLS lazy-loaded
shared/       Kontrak data frontend/backend
config/       Contoh konfigurasi sumber opsional
tests/        Pengujian regresi tanpa upstream eksternal
scripts/      Smoke test upstream dan HTTP
docs/         Laporan rekonstruksi dan keputusan arsitektur
```

## Lisensi dan atribusi

Kode baru dalam repositori ini berlisensi MIT. Lisensi tersebut tidak memberi hak atas konten berita, data pihak ketiga, video CCTV, merek SITREP, atau aset penyedia. Ikuti ketentuan masing-masing sumber sebelum memakai instans secara publik atau komersial.

- [BMKG Data Terbuka](https://data.bmkg.go.id/) — gempa dan atribusi BMKG.
- [Open-Meteo](https://open-meteo.com/) — periksa lisensi data dan persyaratan API, termasuk penggunaan komersial.
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — data VIIRS dan interpretasi anomali termal.
- [ANTARA RSS](https://www.antaranews.com/rss/terkini.xml), [detikNews RSS](https://news.detik.com/berita/rss) — ringkasan feed, tautan penerbit asli.
- [OpenStreetMap](https://www.openstreetmap.org/copyright), [CARTO](https://carto.com/attributions) — peta dasar dan atribusi yang selalu ditampilkan di peta. Tile publik punya kebijakan penggunaan sendiri.
- [Leaflet](https://leafletjs.com/), [hls.js](https://github.com/video-dev/hls.js/) — pustaka frontend dengan lisensi masing-masing.

Font Google dimuat dari layanan Google Fonts. Peta, font, dan stream opsional memerlukan jaringan browser ke penyedia masing-masing. Siapkan penyedia tile dan font lokal sendiri bila kebutuhan privasi, offline, atau skala memerlukannya.
