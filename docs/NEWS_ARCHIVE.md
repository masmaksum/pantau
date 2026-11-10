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

**Konten yang dipreservasi adalah judul, ringkasan, dan metadata yang diterima PANTAU.** Ini belum berupa salinan teks lengkap halaman penerbit, HTML/WARC, PDF, gambar, video, atau snapshot halaman. Tautan asli tetap dicantumkan. Jika halaman penerbit dihapus, ringkasan yang sudah masuk tetap ada, tetapi teks artikel yang belum pernah diambil tidak tersedia di arsip.

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

Kanal saat ini adalah ANTARA dan detikNews; kanal baru yang ditambahkan ke `NEWS_FEEDS` mengikuti pipeline arsip yang sama. BMKG, cuaca, raster/poligon lingkungan, dan lima kanal sosial yang masih dorman tidak dimasukkan ke arsip berita RSS ini.

Server harus tetap berjalan agar pengambilan berkala berlangsung. Tidak ada proses yang berjalan ketika host tidur atau aplikasi dihentikan. Tidak ada pengisian otomatis untuk berita historis yang sudah hilang dari RSS sebelum PANTAU sempat menerimanya. Feed biasanya hanya berisi bagian terbaru situs, sehingga arsip tidak menjamin seluruh publikasi sebuah penerbit tercakup.

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

SQLite memakai WAL, `synchronous=FULL`, transaksi, dan `busy_timeout`. Satu file cocok untuk satu instans aplikasi; dukungan distribusi lintas host atau filesystem jaringan belum diuji. Untuk skala multi-instans, desain antrean dan database bersama perlu dikerjakan tersendiri.

## Membaca dan mengekspor

Tombol **Arsip berita** pada navigasi membuka pencarian berdasarkan:

- Judul/ringkasan.
- Kanal sumber.
- Kategori awal.
- Nama lokasi awal dan ada/tidaknya lokasi.
- Tanggal masuk arsip, dalam WIB.

Detail memperlihatkan teks tersimpan, lokasi/ketelitian, timestamp, seluruh versi, dan fingerprint kriteria. Snapshot aturan dapat diunduh sebagai JSON. Lokasi awal dapat dibuka sebagai titik berlabel **ARSIP** pada peta; titik ini tidak masuk hitungan laporan live.

**Ekspor halaman JSON** mengunduh hasil halaman yang sedang ditampilkan, maksimal 25 artikel, beserta snapshot awal. Ini bukan backup seluruh database atau seluruh revisi. Riwayat lengkap dapat dibaca lewat endpoint detail; backup SQLite mencakup semua catatan, revisi, serta snapshot aturan.

## API

Seluruh endpoint mengikuti `PANTAU_API_TOKEN` yang sama dengan API lainnya. Tidak ada endpoint publik untuk menghapus atau menulis ulang arsip.

| Endpoint                                 | Hasil                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/archive/status`                | Jumlah artikel/revisi, kanal/kategori tersimpan, dan status penyimpanan |
| `GET /api/archive`                       | Daftar snapshot awal dengan pagination                                  |
| `GET /api/archive/:id`                   | Snapshot awal dan seluruh riwayat versi                                 |
| `GET /api/archive/policies/:fingerprint` | Snapshot kode kriteria yang benar-benar dipakai                         |

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

Perintah menggunakan API backup SQLite agar data committed yang masih berada di WAL ikut tercakup. Target baru dibuat secara eksklusif; backup lama tidak ditimpa. `ARCHIVE_PATH` dibaca dari `.env`. File backup berisi data berita dan kriteria, bukan credential `.env`.

Untuk memulihkan: hentikan aplikasi, simpan file database/WAL/SHM lama sebagai satu set pemulihan, letakkan salinan backup yang diverifikasi pada lokasi baru, arahkan `ARCHIVE_PATH` ke salinan itu, lalu jalankan aplikasi. Jangan mencampurkan file backup dengan WAL/SHM lama yang bukan pasangannya. Periksa jumlah artikel/revisi pada `/api/archive/status` setelah start.

## Kegagalan dan verifikasi

Jika transaksi gagal, seluruh batch kanal itu di-rollback. Artikel yang sudah tersimpan sebelumnya tetap ada. Snapshot cache dapat dicoba kembali, dan status arsip di dashboard/API menjadi error; laporan live tidak dinyatakan sudah terarsip dengan sukses ketika penulisan gagal. Cache bukan antrean preservasi yang dijamin tahan semua kombinasi disk penuh, crash, dan pergantian snapshot. Periksa status/volume saat gagal, karena preservasi hanya dijamin untuk transaksi yang berhasil ditulis.

Tes memeriksa restart, snapshot kriteria/lokasi yang tetap, perubahan versi, deduplikasi per kanal, kegagalan transaksi, retry setelah pemulihan, tanggal WIB, filter/pagination, backup WAL, kontrol akses, serta pengarsipan berita yang berada di luar rentang live. Pengujian visual browser belum dilakukan.
