# Arsip permanen berita PANTAU

Sejak v0.1.5, berita yang diterima dari kanal RSS dan lolos kebijakan topik disimpan di **SQLite**, terpisah dari cache pengambilan. Arsip menyimpan kriteria dan lokasi sebagaimana ditentukan saat masuk, sehingga perubahan feed atau aturan kemudian tidak menimpa catatan awal.

## Isi arsip

Setiap catatan menyimpan:

- Identitas kanal (`sourceId`), nama kanal, URL RSS, URL artikel asli, dan URL artikel setelah parameter tracking dihapus.
- Judul dan ringkasan yang diterima dari RSS, waktu publikasi bila tersedia, serta metadata kategori penerbit.
- Kategori PANTAU dan keputusan lolos seleksi saat versi itu masuk.
- Lokasi saat masuk: nama, koordinat, ketelitian (`city`/`province`), dan metode penentuannya. Lokasi yang tidak diketahui tetap `null`.
- Waktu pertama diarsipkan, waktu observasi dalam snapshot sumber, dan waktu terakhir terlihat dalam feed yang berhasil diambil.
- Versi kebijakan, fingerprint SHA-256, dan snapshot kode aturan seleksi/HAM serta gazetteer yang dipakai. Snapshot aturan tersimpan sekali per fingerprint, bukan digandakan untuk setiap artikel.
- Hash konten dan riwayat versi jika judul, ringkasan, kategori, lokasi, metadata publikasi, atau aturan berubah dalam pengambilan berikutnya.

**Sejak v0.1.6, preservasi juga mengambil teks lengkap halaman artikel, file foto, caption/kredit foto, alt, dan byte HTML sumber** dari halaman publik ANTARA dan detik. Isi yang berhasil disimpan tetap tersedia dari SQLite ketika sumber berubah/hilang. Ringkasan RSS, snapshot halaman, dan foto mempunyai waktu/hash serta status masing-masing. Halaman yang belum sempat diambil tidak dapat direkonstruksi dari ringkasan RSS.

Hash dipakai untuk identifikasi perubahan snapshot yang disimpan, bukan sebagai bukti independen keaslian publikasi atau kebenaran klaim. Kategori HAM tetap merupakan pemantauan topik; dugaan dan bantahan mengikuti isi sumber.

## Arti “kriteria saat masuk”

Pengarsipan berlangsung **setelah seleksi topik dan penentuan lokasi**, tetapi **sebelum filter tampilan 6/24/72 jam**, pencarian, kategori pilihan pengguna, atau keharusan memiliki lokasi.

Contoh: saat masuk, berita dikategorikan “HAM · Represi aktivis”, lokasi perkiraan pusat Bandung. Kategori, lokasi, ketelitian, teks, dan aturan tersebut dibekukan pada versi pertama. Jika penerbit memperbarui laporan atau sistem kemudian mengenali lokasi berbeda, snapshot berikutnya disimpan sebagai versi baru; snapshot awal tetap dapat dibaca.

Filter arsip memakai **kategori dan lokasi versi pertama**. Filter tanggal memakai **tanggal masuk arsip dalam WIB**, bukan waktu kejadian atau waktu publikasi. Detail berita menampilkan seluruh versi dan timestamp sumbernya.

Perubahan aturan tidak menghapus atau mengklasifikasi ulang arsip saat dibaca. Berita yang sudah diterima menurut aturan saat itu tetap tersimpan. Aturan baru diterapkan pada pengambilan berikutnya; hasil yang kembali lolos dapat membentuk versi baru. Berita yang ditolak sejak awal tidak dimasukkan ke arsip.

## Identitas dan versi

- Satu artikel diidentifikasi menurut **kanal + URL kanonis**. Artikel dengan URL sama dari dua kanal tetap memiliki dua catatan sumber.
- Pembacaan cache berulang tidak menggandakan catatan. Snapshot kanal dengan `fetchedAt` sama hanya diproses satu kali secara transaksional.
- Pengambilan berikutnya dengan konten sama memperbarui waktu terakhir terlihat, tanpa menambah versi.
- Perubahan isi, kategori, lokasi atau fingerprint aturan menambah versi saat snapshot sumber baru diproses.
- `firstArchivedAt` adalah waktu pertama PANTAU berhasil menulisnya ke arsip, bukan klaim kapan artikel pertama terbit atau pertama beredar di internet.
- Backfill dari cache terakhir menyimpan waktu pengambilan sumber yang asli. Jika sumber sedang gagal, versi diberi asal `last-good-cache`; pembacaan ulang tidak dibuat seolah merupakan pengambilan baru.
- URL yang benar-benar berbeda tetap menjadi catatan berbeda. Belum ada penggabungan artikel lintas URL berdasarkan kesamaan cerita.

## Pengambilan tanpa dashboard terbuka

`npm start` dan `npm run dev` menjalankan pengambilan kanal berita saat server mulai dan setiap 120 detik. Pekerjaan yang bersamaan dengan request dashboard digabung, dan TTL sumber tetap berlaku. `createApp()` untuk tes tidak menyalakan interval; lifecycle tersebut dimiliki `server/index.ts`.

Kanal saat ini adalah ANTARA dan detikNews; kanal baru yang ditambahkan ke `NEWS_FEEDS` mengikuti arsip metadata RSS yang sama, tetapi memerlukan konfigurasi host dan extractor tersendiri untuk preservasi halaman/foto. BMKG, cuaca, raster/poligon lingkungan, dan lima kanal sosial yang masih dorman tidak dimasukkan ke arsip berita RSS ini.

Server harus tetap berjalan agar pengambilan berkala berlangsung. Tidak ada proses yang berjalan ketika host tidur atau aplikasi dihentikan. Tidak ada pengisian otomatis untuk berita historis yang sudah hilang dari RSS sebelum PANTAU sempat menerimanya. Feed biasanya hanya berisi bagian terbaru situs, sehingga arsip tidak menjamin seluruh publikasi sebuah penerbit tercakup.

## Pengambilan halaman, foto, dan caption — v0.1.6

Setiap revisi RSS yang diterima memasukkan pekerjaan pengambilan halaman dalam transaksi yang sama. Revisi lama pada database v0.1.5 otomatis dimasukkan ke antrean ketika aplikasi baru dibuka. Tidak perlu impor ulang atau menghapus arsip lama. Pekerjaan yang sempat berjalan saat proses berhenti dikembalikan ke antrean saat start berikutnya.

Worker di `server/index.ts` memeriksa antrean setiap lima detik dan mengerjakan maksimal dua pekerjaan per putaran secara berurutan; putaran bersamaan digabung. Request dashboard/RSS tidak menunggu unduhan halaman/foto. Jeda dasar per host 1,5 detik, dengan pemeriksaan `robots.txt` yang disimpan dalam memori satu jam; crawl-delay hingga 60 detik dihormati. Jika aturan robots tidak dapat diperiksa, pengambilan ditunda/dinyatakan gagal sesuai jenis respons. Tidak ada JavaScript penerbit yang dijalankan.

Extractor memakai DOM artikel ANTARA (`.post-content`, foto utama) dan detik (`.detail__body-text`, foto utama/sisipan). Paragraf seluruh bagian `multi-card` detik yang sudah tersedia di HTML ikut dibaca. Foto diambil dari elemen artikel, termasuk atribut lazy-load/srcset; iklan, ikon loading, tracker yang dikenali, dan rekomendasi dikeluarkan. Caption/kredit disimpan dari `figcaption` atau format foto sisipan detik, **terpisah dari alt**. Caption yang tidak disediakan tetap `null`, tidak ditulis ulang atau ditebak. Identitas reporter disimpan bila ditemukan. HTML mentah tetap memuat isi respons sumber; teks baca merupakan hasil ekstraksi yang dapat keliru jika struktur situs berubah.

File foto JPEG, PNG, WebP, dan GIF yang valid disimpan sebagai binary lokal, dideduplikasi berdasarkan SHA-256. Pembaca arsip mengambil foto dari API PANTAU menggunakan token akses yang sama; tidak hotlink ke CDN penerbit. HTML sumber disimpan sebagai binary dengan hash, ditawarkan sebagai attachment, dan tidak dirender sebagai halaman aktif pada origin PANTAU. Teks serta caption ditampilkan dengan escaping. Aset hanya dapat diambil melalui ID artikel/snapshot yang benar.

Pengambilan halaman dibatasi ke host ANTARA/detik yang didefinisikan di `server/article-fetch.ts`, dan foto ke CDN penerbit yang dikenal. Setiap redirect diperiksa ulang. Host/protokol lain, port khusus, URL bercredential, dan tujuan internal tidak diterima. Kanal baru memerlukan perubahan allowlist dan extractor yang ditinjau.

### Status dan batas

- `queued`: menunggu pengambilan.
- `running`: sedang diambil.
- `retry`: gangguan sementara atau hasil sebagian, menunggu percobaan berikutnya.
- `complete`: extractor menemukan teks utama dan semua foto/halaman yang terdeteksi berhasil disimpan tanpa peringatan. Ini bukan jaminan semua materi yang hanya terlihat sesudah JavaScript tersedia.
- `partial`: snapshot berisi teks/HTML atau foto yang berhasil disimpan, dengan peringatan bagian yang belum tersedia.
- `unavailable`: tidak ada salinan halaman yang berhasil dibuat setelah kegagalan permanen atau batas percobaan; metadata RSS tetap ada.

Hasil sebagian disimpan segera sebagai snapshot, lalu dicoba ulang. Maksimal tiga percobaan per revisi RSS: jeda dasar lima menit setelah percobaan pertama dan 30 menit setelah percobaan kedua; `Retry-After` yang lebih panjang dihormati. Setiap hasil pengambilan berikutnya menambah snapshot; teks/foto yang sudah berhasil disimpan tidak ditimpa. Setelah batas percobaan, hasil sebagian tetap berstatus `partial`. Kegagalan foto tetap menyimpan URL asal, caption, alt, serta alasan kegagalannya.

Batas per snapshot: lima halaman, 20 foto, 5 MiB per respons HTML, 8 MiB per foto, dan 64 MiB total foto. Timeout setiap request 20 detik. Halaman lanjutan hanya diikuti dari tautan pagination eksplisit untuk artikel yang sama; melebihi batas atau kegagalan sebagian menghasilkan peringatan. SVG, video/audio, PDF, CSS/font, screenshot, dan format WARC belum dipreservasi. Halaman login/paywall atau CAPTCHA tidak dibypass. Server harus aktif; keterlambatan antrean dapat berarti halaman sudah berubah/hilang sebelum sempat diambil.

Waktu `capturedAt`/`pages[].fetchedAt` adalah waktu pengambilan halaman sebenarnya. Ia **berbeda dari waktu masuk RSS** dan tidak menyatakan bahwa halaman versi lama tersedia saat itu. Kategori/lokasi tetap merujuk snapshot RSS yang terkait; pengambilan ulang halaman tidak mengubah kriteria awal. Satu capture dapat mempunyai beberapa halaman dengan waktu berbeda. Revisi RSS baru memicu pengambilan baru; perubahan halaman yang tidak mengubah snapshot RSS belum dipantau berkala secara terpisah.

Salinan bersifat ekstraksi artikel dan aset yang terdeteksi, bukan jaminan replika visual situs. Konten bertumpu pada akses publik, struktur halaman, izin akses sumber, dan keberhasilan jaringan. Tautan, kredit, dan pemberitahuan penerbit dipertahankan pada HTML sumber. Jika ekstraksi teks terlalu pendek, HTML tetap disimpan dan hasil diberi status sebagian untuk pemeriksaan.

## Penyimpanan dan deployment

Gunakan **Node.js 24 atau lebih baru**. SQLite disediakan modul bawaan Node, tanpa layanan database eksternal. Konfigurasi:

```dotenv
CACHE_DIR=.cache
ARCHIVE_PATH=data/news.sqlite
```

`.cache/` dapat dibuang, tetapi **folder arsip harus dipertahankan**. Menghapus cache tidak menghapus arsip SQLite yang diletakkan terpisah. Database, WAL, SHM, dan backup tidak masuk Git. Belum ada penghapusan arsip otomatis atau TTL arsip.

Pada Railway atau host dengan filesystem deployment sementara, pasang **volume persisten** dan arahkan `ARCHIVE_PATH` ke volume, misalnya:

```dotenv
HOST=0.0.0.0
ARCHIVE_PATH=/data/news.sqlite
```

Proses aplikasi memerlukan izin tulis pada direktori tersebut. Arsip bertahan melewati restart selama file/volume tetap tersedia. Mengganti container tanpa volume tidak membuat filesystem sementara menjadi penyimpanan permanen. Backup terpisah tetap diperlukan untuk pemulihan jika volume hilang.

Teks, HTML, dan binary foto disimpan dalam database yang sama dengan antrean persisten. Ukuran arsip akan bertambah mengikuti foto dan riwayat snapshot; pantau kapasitas volume karena belum ada retensi/penghapusan otomatis. Binary yang sama hanya disimpan satu kali menurut hash.

SQLite memakai WAL, `synchronous=FULL`, transaksi, dan `busy_timeout`. Satu file cocok untuk satu instans aplikasi; dukungan distribusi lintas host atau filesystem jaringan belum diuji. Untuk skala multi-instans, desain antrean dan database bersama perlu dikerjakan tersendiri.

## Membaca dan mengekspor

Subtab **Kanal Berita → Arsip** membuka pencarian berdasarkan:

- Judul/ringkasan awal dan teks artikel yang sudah berhasil diekstrak (termasuk snapshot pengambilan sebelumnya).
- Kanal sumber.
- Kategori awal.
- Nama lokasi awal dan ada/tidaknya lokasi.
- Tanggal masuk arsip, dalam WIB.

Detail memperlihatkan teks tersimpan, lokasi/ketelitian, timestamp, seluruh versi, dan fingerprint kriteria. Snapshot aturan dapat diunduh sebagai JSON. Lokasi awal dapat dibuka sebagai titik berlabel **ARSIP** pada peta; titik ini tidak masuk hitungan laporan live.

**Ekspor halaman JSON** mengunduh hasil halaman yang sedang ditampilkan, maksimal 25 artikel, beserta snapshot awal. Ini bukan backup seluruh database atau seluruh revisi. Riwayat lengkap dapat dibaca lewat endpoint detail; backup SQLite mencakup semua catatan, revisi, snapshot aturan, antrean, teks, HTML sumber, dan file foto. Detail juga menyediakan unduhan teks artikel, metadata snapshot JSON, HTML setiap halaman, serta foto tersimpan. Ekspor metadata JSON menyertakan caption/hash, bukan binary foto; gunakan backup SQLite untuk salinan menyeluruh.

## API

Seluruh endpoint mengikuti `PANTAU_API_TOKEN` yang sama dengan API lainnya. Tidak ada endpoint publik untuk menghapus atau menulis ulang arsip.

| Endpoint                                                | Hasil                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/archive/status`                               | Jumlah artikel/revisi, kanal/kategori tersimpan, dan status penyimpanan     |
| `GET /api/archive`                                      | Daftar snapshot awal dengan pagination                                      |
| `GET /api/archive/lookup?source=...&url=...`            | ID catatan dari kanal dan URL kanonis, tanpa mengambil URL dari jaringan    |
| `GET /api/archive/:id`                                  | Snapshot awal, riwayat RSS, `preservation.jobs` dan `preservation.captures` |
| `GET /api/archive/:id/captures/:captureId/assets/:hash` | File foto atau unduhan HTML sumber milik snapshot tersebut                  |
| `GET /api/archive/policies/:fingerprint`                | Snapshot kode kriteria yang benar-benar dipakai                             |

Parameter daftar: `q`, `source`, `category`, `location`, `located=yes/no`, `from`, `to`, `limit` (1–100), `offset` (0–1.000.000). `from` dan `to` berbentuk `YYYY-MM-DD` dalam WIB; tanggal `to` inklusif. Lokasi/kategori merujuk versi pertama. Urutan berdasarkan waktu masuk arsip terbaru.

Contoh:

```text
/api/archive?source=antara&category=ham-aktivis&location=Bandung&from=2026-11-01&to=2026-11-10
```

Query memakai parameter SQL terikat. Karakter `%` dan `_` pada pencarian diperlakukan literal, bukan sebagai wildcard buatan pengunjung. Isi arsip tidak dikirim ke platform sosial atau layanan AI.

## Backup dan pemulihan

```sh
npm run archive:backup -- backups/news-2026-11-10.sqlite
```

Perintah menggunakan API backup SQLite agar data committed yang masih berada di WAL ikut tercakup. Target baru dibuat secara eksklusif; backup lama tidak ditimpa. `ARCHIVE_PATH` dibaca dari `.env`. File backup berisi data berita, kriteria, teks, caption, binary foto/HTML, dan antrean; tidak mencakup credential `.env`. Tidak ada folder foto terpisah yang harus disalin.

Untuk memulihkan: hentikan aplikasi, simpan file database/WAL/SHM lama sebagai satu set pemulihan, letakkan salinan backup yang diverifikasi pada lokasi baru, arahkan `ARCHIVE_PATH` ke salinan itu, lalu jalankan aplikasi. Jangan mencampurkan file backup dengan WAL/SHM lama yang bukan pasangannya. Periksa jumlah artikel/revisi pada `/api/archive/status` setelah start.

## Kegagalan dan verifikasi

Jika transaksi gagal, seluruh batch kanal itu di-rollback. Artikel yang sudah tersimpan sebelumnya tetap ada. Snapshot cache dapat dicoba kembali, dan status arsip di dashboard/API menjadi error; laporan live tidak dinyatakan sudah terarsip dengan sukses ketika penulisan gagal. Cache bukan antrean preservasi yang dijamin tahan semua kombinasi disk penuh, crash, dan pergantian snapshot. Periksa status/volume saat gagal, karena preservasi hanya dijamin untuk transaksi yang berhasil ditulis.

Tes memeriksa restart, snapshot kriteria/lokasi yang tetap, perubahan versi, deduplikasi per kanal, kegagalan transaksi, retry setelah pemulihan, tanggal WIB, filter/pagination, backup WAL, kontrol akses, pengarsipan berita di luar rentang live, ekstraksi teks/caption, pengambilan foto asli, status sebagian/retry, migrasi antrean, pembatasan URL/redirect/ukuran/format, otorisasi aset, dan pemulihan seluruh binary dari backup. `npm run smoke:preservation` menguji satu berita live per kanal dengan database sementara yang dibuang setelah pemeriksaan. Pengujian visual browser belum dilakukan.
