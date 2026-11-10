# PANTAU

**Ruang pantau sumber terbuka Indonesia.** Berita, peta laporan, gempa, cuaca, dan hotspot opsional dalam satu dashboard berbahasa Indonesia.

PANTAU adalah aplikasi yang dikembangkan secara mandiri untuk memantau informasi publik di Indonesia. PANTAU menghubungkan laporan terkini dengan konteks wilayah dan lingkungan, disertai sumber, waktu pembaruan, serta keterangan ketelitian data agar informasi mudah ditelusuri dan dipahami.

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
- Pengelompokan laporan yang lolos kebijakan topik: gempa, banjir/longsor, kebakaran, demo, politik, dan lainnya.
- Pengecualian kriminal, transportasi, ekonomi, dan selebritis pada judul, ringkasan, serta kategori RSS/Atom; berlaku juga untuk feed sosial dan cache lama.
- Pencocokan judul ke gazetteer kota/provinsi terbatas. Lokasi ambigu tetap kosong. Setiap pin mencantumkan ketelitian dan metode penentuan lokasi.
- Gempa BMKG melalui data JSON resmi, dengan waktu, magnitudo, kedalaman, dan episentrum.
- Cuaca Open-Meteo per kota: suhu, hujan, angin, dan prakiraan tiga hari.
- Hotspot VIIRS NASA FIRMS jika operator mengisi `FIRMS_MAP_KEY`.
- Filter 6/24/72 jam, kategori, pencarian, dan hanya laporan berlokasi; pembaruan otomatis 120 detik.
- Ekspor GeoJSON untuk titik sesuai filter, termasuk sumber, timestamp, ketelitian, dan jumlah laporan yang tidak terpetakan.
- Cache terakhir yang berhasil, penanda data lama, jeda retry, dan penggabungan request bersamaan ke sumber yang sama.
- Konfigurasi CCTV HLS/tautan dan feed sosial RSS resmi/berizin. Tidak ada kamera atau posting sosial bawaan yang dibuat-buat.
- Token akses API opsional untuk instans yang memerlukannya.

## Konteks lingkungan — v0.1.2

PANTAU menggabungkan laporan terkini dengan data lingkungan dari penyedia primer. Buka panel **Lapisan lingkungan** pada peta:

- Kehilangan tutupan pohon UMD/GFW, kumulatif 2001–tahun pilihan (hingga 2025).
- Citra harian NASA MODIS Terra dan gambar hotspot arsip VIIRS NOAA-20, dengan tanggal UTC.
- Model kualitas udara CAMS/Open-Meteo (PM2.5, PM10, US AQI) sesuai kota cuaca.
- Statistik catatan keberadaan GBIF Indonesia, termasuk kategori ancaman dalam GBIF; bukan jumlah satwa/spesies dan tanpa koordinat satwa.
- Katalog sumber, tahun, lisensi, batasan, serta tombol memperluas peta.
- Adapter opsional konsesi sawit/HTI/logging, jejak lahan tambang, dan moratorium via `GFW_API_KEY` milik operator. Versi awal dibatasi 100 fitur dengan penanda sampel.
- Impor GeoJSON operator untuk mangrove, gambut, DAS, dan banjir/longsor historis. Belum ada data berkas yang dibundel atau dianggap terkonfigurasi.

Lihat [inventaris sumber, perbandingan tampilan, dan panduan integrasi](docs/MANDUM_RIMBA.md). **Raster/arsip konteks tidak dicampur ke hitungan kejadian terbaru atau ekspor laporan GeoJSON.** Sumber yang dibatasi lisensi (WDPA, GADM, poligon IUCN) tetap berupa referensi; Trase dikecualikan karena kebijakan topik ekonomi.

## Batasan topik

PANTAU tidak menampilkan laporan **kriminal, transportasi, ekonomi, atau selebritis**. Kebijakan ada di `shared/topic-policy.ts`: kata kunci dan padanannya diperiksa pada judul, ringkasan, serta kategori RSS/Atom sebelum hasil ingestion disimpan. Respons API memeriksa ulang cache lama, sehingga laporan lama tidak dapat melewati kebijakan. Penghitungan item sumber mengikuti hasil yang lolos.

Pengecualian didahulukan pada laporan campuran: misalnya “banjir menyebabkan kemacetan” tetap dikecualikan karena membahas transportasi. Laporan bencana, demonstrasi, dan politik yang tidak cocok dengan pengecualian tetap ditampilkan. Kategori kriminal dan transportasi tidak lagi tersedia di pilihan filter; kategori internal lama masih dikenali untuk kompatibilitas cache. Pengecualian berlaku pada daftar, peta, ringkasan jumlah laporan, dan ekspor GeoJSON. Prakiraan cuaca dan konfigurasi kamera bukan laporan berita dan tidak menjalani klasifikasi topik ini.

Aturan ini berbasis kata kunci, bukan pemahaman konteks. Laporan dapat salah tersaring atau lolos bila memakai istilah/nama yang belum dikenal. `Lainnya` tetap tersedia untuk topik yang tidak dilarang; ini bukan whitelist topik bencana. Aturan bisa diperluas berdasarkan contoh berita yang ditemukan.

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

Sumber yang gagal tetap ditampilkan sebagai gagal. Data diambil dari penyedia sumber dengan konfigurasi akses masing-masing. Jangan menganggap `HTTP 200` pada `/api/situation` berarti seluruh sumber berhasil; selalu periksa `sources[].status`.

**Belum diimplementasikan:** ringkasan AI/LLM, pembaca artikel lengkap, X/Threads API langsung, globe 3D, heatmap, MAGMA, SiPongi, AQMS, radar/angin, TomTom, ADS-B, AIS, BJKT, pasar/IDX, dan korelasi kejadian lintas sumber. Peta laporan menunjukkan titik, bukan batas dampak atau luasan kebakaran. Lapisan konteks dapat menampilkan raster/poligon yang terpisah.

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

Endpoint lingkungan tambahan: `/api/datasets`, `/api/air-quality?city=jakarta`, `/api/biodiversity`, `/api/context/:id`. Detail di [panduan lingkungan](docs/MANDUM_RIMBA.md).

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
npm run smoke:environment # CAMS, GBIF, raster GFW/NASA; signature gambar diverifikasi
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
docs/         Riset sumber data dan keputusan arsitektur
```

## Lisensi dan atribusi

Kode PANTAU dalam repositori ini berlisensi MIT. Lisensi tersebut tidak memberi hak atas konten berita, data pihak ketiga, video CCTV, merek, atau aset penyedia. Ikuti ketentuan masing-masing sumber sebelum memakai instans secara publik atau komersial.

- [BMKG Data Terbuka](https://data.bmkg.go.id/) — gempa dan atribusi BMKG.
- [Open-Meteo](https://open-meteo.com/) — periksa lisensi data dan persyaratan API, termasuk penggunaan komersial.
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) — data VIIRS dan interpretasi anomali termal.
- [ANTARA RSS](https://www.antaranews.com/rss/terkini.xml), [detikNews RSS](https://news.detik.com/berita/rss) — ringkasan feed, tautan penerbit asli.
- [OpenStreetMap](https://www.openstreetmap.org/copyright), [Esri](https://www.esri.com/en-us/legal/terms/data-attributions) — peta dasar dan atribusi yang selalu ditampilkan di peta. Tile publik punya kebijakan penggunaan sendiri.
- [Leaflet](https://leafletjs.com/), [hls.js](https://github.com/video-dev/hls.js/) — pustaka frontend dengan lisensi masing-masing.

Font Google dimuat dari layanan Google Fonts. Peta, font, dan stream opsional memerlukan jaringan browser ke penyedia masing-masing. Siapkan penyedia tile dan font lokal sendiri bila kebutuhan privasi, offline, atau skala memerlukannya.


## Referensi

Pengembangan PANTAU menggunakan dua proyek berikut sebagai referensi untuk mempelajari pendekatan pemantauan informasi publik, penyajian peta, dan penelusuran sumber data:

- [SITREP Indonesia](https://sitrep-production.up.railway.app/) — referensi pemantauan situasi, penggabungan laporan, dan penyajian informasi geografis.
- [Mandum Rimba](https://github.com/ammar-rasyidi/mandum-rimba) — referensi penyajian konteks lingkungan, lapisan peta, dan keterbukaan sumber data.

Catatan riset tersedia dalam [kajian pemantauan situasi](docs/REVERSE_ENGINEERING.md) dan [kajian data lingkungan](docs/MANDUM_RIMBA.md).
