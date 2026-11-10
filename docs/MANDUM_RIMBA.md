# Riset Mandum Rimba dan perluasan PANTAU

Pemeriksaan: **10 November 2026 (WIB)**. Repositori referensi: [ammar-rasyidi/mandum-rimba](https://github.com/ammar-rasyidi/mandum-rimba), commit [`e3ce3a5d24981664dbfac6390418bc28135189ed`](https://github.com/ammar-rasyidi/mandum-rimba/tree/e3ce3a5d24981664dbfac6390418bc28135189ed).

PANTAU v0.1.2 mengambil pelajaran dari inventaris sumber dan pendekatan penjelasan Mandum Rimba. Integrasi ditulis mandiri dan mengambil data dari penyedia primer. Tidak menyalin source aplikasi AGPL, logo, aset, poligon turunan biodiversitas, tile bucket, atau API privat Mandum Rimba ke repositori MIT PANTAU.

## 1. Sumber data yang ditemukan

Temuan dibandingkan antara [README](https://github.com/ammar-rasyidi/mandum-rimba/blob/main/README.md), [DATA-FLOW](https://github.com/ammar-rasyidi/mandum-rimba/blob/main/DATA-FLOW.md), [katalog sumber](https://github.com/ammar-rasyidi/mandum-rimba/blob/main/apps/web/src/lib/data-catalog.ts), [adapter ingest](https://github.com/ammar-rasyidi/mandum-rimba/tree/main/apps/api/src/ingest), serta [halaman sumber publik](https://www.mandumrimba.org/id/sumber-data). README masih menandai beberapa fitur sebagai rencana sementara katalog/kode terbaru sudah memuat jalur implementasinya. Adanya kode atau entri katalog tidak membuktikan seluruh pipeline produksi sedang berhasil.

| Informasi                      | Sumber primer / jalur Mandum                                                                         | Implementasi PANTAU v0.1.2                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Kehilangan tutupan pohon       | Hansen/UMD, GFW; raster v1.13, 2001–2025                                                             | Langsung, tanpa key: raster GFW `render_type=true_color`, tahun akhir dapat dipilih                                  |
| Konsesi sawit                  | GFW `gfw_oil_palm/v2025`, turunan Greenpeace                                                         | Adapter opsional dengan `GFW_API_KEY`                                                                                |
| HTI/pulpwood                   | GFW `gfw_wood_fiber/v2025`                                                                           | Adapter opsional dengan key                                                                                          |
| Logging                        | GFW `gfw_logging/v202106`                                                                            | Adapter opsional dengan key                                                                                          |
| Jejak lahan tambang            | [Maus et al. 2022 / PANGAEA](https://doi.org/10.1594/PANGAEA.942325), GFW `pangaea_global_mining/v2` | Adapter opsional dengan key; bukan poligon izin IUP                                                                  |
| Moratorium hutan               | KLHK PIPPIB via GFW `idn_forest_moratorium/v20200923`                                                | Adapter opsional dengan key; label snapshot 2020                                                                     |
| Kawasan lindung                | Protected Planet / WDPA                                                                              | Katalog referensi; tidak diimpor karena ketentuan redistribusi belum dikonfirmasi                                    |
| Mangrove                       | Global Mangrove Watch v3, ekstent 2020                                                               | Adapter GeoJSON operator; perlu berkas, lisensi, dan tahun data                                                      |
| Gambut                         | Wetlands International/Wahyunto via GFW; kode ingest juga punya jalur KLHK KHG                       | Adapter GeoJSON operator; sumber dan tahun harus spesifik, tidak menyamakan gambut dengan KHG                        |
| Banjir/longsor historis        | BNPB DIBI via ekspor UNDRR DesInventar                                                               | Adapter GeoJSON arsip; ETL besar tidak berjalan pada request web                                                     |
| Udara/asap                     | Copernicus CAMS melalui Open-Meteo; Mandum menambah angin NOAA GFS                                   | Sampel PM2.5, PM10, US AQI Open-Meteo per kota dan deret per jam lewat API; belum field nasional atau partikel angin |
| Citra harian                   | NASA EOSDIS GIBS / Worldview                                                                         | MODIS Terra True Color; pemilih tanggal UTC, tanpa key                                                               |
| Hotspot arsip                  | NASA GIBS / FIRMS                                                                                    | Gambar WMS VIIRS NOAA-20 per hari, tanpa key; terpisah dari CSV FIRMS yang memerlukan key                            |
| Catatan biodiversitas          | GBIF occurrence records                                                                              | Statistik nasional 1990–tahun berjalan, hanya occurrence `PRESENT`, agregasi kategori IUCN GBIF                      |
| Status konservasi              | IUCN Red List; penafsiran takson oleh GBIF                                                           | Memakai facet GBIF; tidak mengambil poligon resmi IUCN atau menyatakan status hukum dilindungi                       |
| Habitat pembobot biodiversitas | ESA WorldCover 2021                                                                                  | Referensi di katalog; belum raster/pembobotan habitat                                                                |
| DAS                            | HydroBASINS / HydroSHEDS                                                                             | Adapter GeoJSON operator; belum analisis hidrologi/kausalitas                                                        |
| Batas wilayah                  | GADM 4.1                                                                                             | Referensi, tidak dibundel; gazetteer PANTAU masih terpisah                                                           |
| Penyaringan titik perkotaan    | Natural Earth                                                                                        | Referensi; statistik nasional GBIF PANTAU belum menjalankan pipeline mask perkotaan                                  |
| Pencarian lokasi / orientasi   | OSM / Nominatim, Esri, CARTO, label NASA GIBS                                                        | PANTAU memakai Esri Dark Gray dan OSM; tidak menambah pencarian Nominatim                                            |
| Keterkaitan rantai pasok       | Trase                                                                                                | Tidak diintegrasikan: di luar kebijakan topik ekonomi PANTAU                                                         |
| Laporan bulanan deforestasi    | Nusantara Atlas, adapter cite-and-link                                                               | Referensi riset saja, tidak menyalin data dengan pembatasan redistribusi                                             |

Mandum juga memakai Permen LHK P.106/2018, peraturan KKP, CITES, literatur ilmiah, dan POWO/Kew untuk kurasi profil satwa/flora. Itu sumber rujukan/kurasi, bukan satu API peta siap dipakai. PANTAU belum menyalin profil tersebut atau memberi label hukum “dilindungi” berdasarkan status IUCN saja.

Pada kode/katalog Mandum, beberapa kekosongan dinyatakan secara terbuka: batas IUP ESDM MOMI tidak tersedia tanpa akses; pengukuran stasiun ISPU/IQAir/WAQI/OpenAQ punya keterbatasan akses, ketentuan, atau cakupan; poligon IUCN dan KBA memerlukan perjanjian/permintaan data. Kekosongan tersebut tidak diisi dengan koordinat atau dataset buatan di PANTAU.

### Lisensi dan pemisahan implementasi

Mandum Rimba berlisensi **AGPL-3.0-or-later**, dengan merek/aset terpisah. Jika source mereka disalin atau dibuat turunannya, kewajiban AGPL dan atribusi berlaku. Pembaruan PANTAU ini memakai inventaris faktual dan konsep antarmuka sebagai referensi, lalu menulis adapter dan tampilan sendiri. Contoh: raster GFW dirender langsung oleh API primer, tanpa menyalin protokol Canvas/MapLibre Mandum. Tidak mengambil turunan kontur satwa yang dilindungi/dibatasi lisensi sumber.

Lisensi source aplikasi berbeda dengan lisensi dataset. GFW, GMW, PANGAEA, WorldCover, GBIF, WDPA, dan HydroBASINS tetap punya ketentuan masing-masing. PANTAU menyertakan sumber, tahun, dan catatan lisensi dalam katalog; katalog bukan pemberian hak baru atas data.

## 2. Perbandingan tampilan

Pemeriksaan visual memakai gambar antarmuka yang disertakan repositori: [peta datar](https://github.com/ammar-rasyidi/mandum-rimba/blob/main/apps/web/public/images/mandum_rimba_flat_map.png) dan [terrain 3D](https://github.com/ammar-rasyidi/mandum-rimba/blob/main/apps/web/public/images/mandum_rimba_3d_terrain.png). Struktur halaman publik juga diperiksa melalui pembaca web. Browser interaktif tidak tersedia pada lingkungan sesi ini; gambar repositori tidak membuktikan keadaan produksi terkini.

| Aspek            | Mandum Rimba                               | PANTAU sebelum pembaruan                      | Adaptasi yang dibuat                                              |
| ---------------- | ------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------- |
| Pusat pengalaman | Peta layar besar untuk eksplorasi wilayah  | Dashboard tiga kolom: ikhtisar, peta, laporan | Pertahankan dashboard, tambahkan tombol **Perluas peta**          |
| Kendali data     | Panel lapisan dan subkategori              | Filter kategori laporan                       | Panel **Lapisan lingkungan** terpisah dari filter laporan         |
| Waktu            | Tahun kehilangan tutupan dan tanggal citra | Rentang publikasi 6/24/72 jam                 | Kontrol tahun/tanggal terpisah, tidak mengubah rentang berita     |
| Jenis informasi  | Konteks bentang alam dan biodiversitas     | Laporan terkini dan cuaca                     | Kartu kualitas udara + statistik biodiversitas di bawah dashboard |
| Transparansi     | Sumber, tahun data, metodologi, lisensi    | Sumber laporan dan status feed                | Katalog sumber dengan status siap/config/reference/excluded       |
| Peta             | MapLibre, globe/terrain, PMTiles           | Leaflet 2D dan pin                            | Tetap Leaflet 2D; raster NASA/GFW dan vektor konteks opsional     |

Pendekatan gabungan: **PANTAU menjawab “apa yang dilaporkan sekarang?” dan lapisan lingkungan membantu menjelaskan “kondisi wilayahnya seperti apa?”** Keduanya berdampingan, tanpa menyimpulkan banjir disebabkan deforestasi hanya karena tampak berdekatan.

Tidak menyalin halaman kampanye, kartu identitas satwa, merek, atau visual terrain 3D. Penambahan globe tidak diperlukan untuk fungsi pemeriksaan sumber dan konteks pada versi ini.

## 3. Penggunaan fitur baru

1. Buka **Lapisan lingkungan** di atas peta.
2. Aktifkan kehilangan tutupan pohon, citra NASA, atau hotspot arsip. Raster diunduh langsung browser dari penyedia primer, bukan dari server Mandum Rimba.
3. Pilih tahun akhir kehilangan tutupan (kumulatif 2001–tahun pilihan) dan tanggal akuisisi NASA (UTC). Tanggal awal default H-2 UTC untuk memberi waktu publikasi; tanggal paling baru yang bisa dipilih adalah kemarin. Produk hotspot yang dipakai NOAA-20; kalender dibatasi mulai 2018. Ketersediaan tiap hari tetap tergantung penyedia.
4. Status ubin menunjukkan pemuatan atau kegagalan. Ubin kosong/tertutup awan tidak berarti tidak ada kejadian. Gambar hotspot tidak dapat dihitung/diklik sebagai titik dan tidak termasuk ekspor laporan GeoJSON.
5. Buka **Sumber, tahun & lisensi** untuk melihat versi, hak penggunaan, metode, dan ketidakpastian.
6. Kota pada kartu cuaca juga mengatur sampel model udara. Statistik GBIF tetap **nasional**, tidak mengikuti kota atau filter berita.

PM2.5/PM10 adalah konsentrasi model µg/m³, bukan hasil stasiun. US AQI berasal dari Open-Meteo; PANTAU tidak mengklaim menghitung breakpoint EPA terbaru sendiri dan tidak menyamakannya dengan ISPU Indonesia. Statistik biodiversitas menghitung catatan occurrence, termasuk kemungkinan duplikasi dan bias survei, bukan jumlah individu atau spesies. Catatan bertahun 1990 tidak otomatis berarti spesies masih ada di tempat tersebut hari ini.

### Mengaktifkan vektor GFW

Isi `GFW_API_KEY` milik operator di `.env`. Key tidak dikirim ke browser. Lima adapter tersedia: konsesi sawit, HTI/pulp, logging, jejak tambang Maus, dan moratorium PIPPIB. Query server tetap dan membatasi data ke Indonesia bila dataset global.

Implementasi awal mengambil **maksimal 100 fitur pertama**, dengan satu record tambahan untuk mendeteksi pemotongan. Jika lebih banyak tersedia, antarmuka menandai **SAMPEL TERBATAS**, bukan seluruh cakupan. Pemilihan ini bukan sampel statistik dan tidak representatif. Tidak ada perhitungan luas nasional, angka perusahaan, status izin terbaru, atau klaim pelanggaran. Integrasi vector live belum diuji tanpa key; perubahan skema bisa memerlukan penyesuaian. Untuk cakupan penuh kelak perlu pipeline ETL/paginasi dan vector tiles, bukan memperbesar payload browser tanpa batas.

### Mengaktifkan berkas konteks

Salin `config/context.example.json` ke `config/context.json`. Letakkan GeoJSON berlisensi/bersumber jelas pada `config/context-data/` (folder dan konfigurasi diabaikan Git). Isi `sourceUrl`, `license`, dan `vintage` sesuai berkas yang sebenarnya. ID yang diperbolehkan:

- `mangrove`
- `peatland`
- `bnpb-history`
- `hydrobasins`

Format `FeatureCollection`, geometri Point/Polygon/MultiPolygon pada WGS84. Koordinat divalidasi dalam kotak 94–142 BT dan 11,5 LS–6,5 LU; ini bukan mask batas negara. Ring poligon wajib tertutup. Batas ukuran 5 MiB, maksimal 1.000 fitur; pemotongan/penolakan dinyatakan. Popup hanya mengambil properti `name`, `eventType`, dan `date` agar tidak meneruskan properti mentah tak terverifikasi.

Untuk `bnpb-history`, `eventType` harus memuat banjir/longsor dan `date` harus bisa dibaca sebagai tanggal. Titik kecamatan/kabupaten dari arsip tetap perkiraan, bukan alamat kejadian. Lapisan ini adalah arsip terpisah, bukan laporan baru dalam 24 jam.

Contoh konfigurasi berikut memakai file operator, bukan data contoh yang diklaim nyata:

```json
[
  {
    "id": "bnpb-history",
    "file": "bnpb-banjir-longsor.geojson",
    "sourceUrl": "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=idn",
    "license": "Isi ketentuan redistribusi dan atribusi yang telah diverifikasi",
    "vintage": "Isi rentang arsip dan tanggal ekspor sebenarnya"
  }
]
```

Tidak ada importer ekspor DesInventar 343 MB yang dijalankan pada request. PANTAU belum mengunduh arsip besar atau membangun ulang kontur biodiversitas Mandum.

## API tambahan

| Endpoint                        | Isi                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `/api/datasets`                 | Katalog sumber; `configured` berarti konfigurasi tersedia, bukan sudah berhasil termuat |
| `/api/air-quality?city=jakarta` | Cache sampel CAMS/Open-Meteo + waktu model dan waktu pengambilan                        |
| `/api/biodiversity`             | Cache agregasi GBIF nasional, tanpa koordinat individu                                  |
| `/api/context/:id`              | Vektor opsional + `truncated`, `rejected`, status dan timestamp                         |

Semua endpoint tetap mengikuti `PANTAU_API_TOKEN`. Cache udara satu jam, GBIF satu hari, GFW satu hari; perubahan lokal dibaca ulang saat dipilih. Isi `CONTEXT_CONFIG`/`CONTEXT_DATA_DIR` bila memakai lokasi konfigurasi berbeda.

## Pengujian dan keterbatasan

`npm test`, `npm run build`, `npm run smoke`, dan `npm run smoke:environment` memeriksa alur yang berbeda. Smoke lingkungan memvalidasi signature PNG/JPEG, bukan hanya HTTP 200: pengujian menemukan NASA SNPP dapat merespons HTTP 200 berisi XML error pada tanggal tertentu; NOAA-20 berhasil pada tanggal yang diuji. Produk default dipilih eksplisit, bukan menyajikan error sebagai peta kosong.

Perbandingan hasil awal: CAMS/Open-Meteo berhasil, GBIF mengembalikan sekitar 3,06 juta catatan `PRESENT` Indonesia 1990–2026, GFW true-color dan citra/hotspot NASA mengembalikan gambar valid. Angka tersebut berubah dan bukan jumlah satwa. Vector GFW, berkas operator, rendering browser, serta pengujian mobile interaktif tetap perlu validasi tersendiri.

Kebijakan pengecualian kriminal/transportasi/ekonomi/selebritis tetap berlaku pada feed laporan. Trase tidak diintegrasikan. Lapisan konsesi/tambang ditujukan untuk konteks bentang alam, tidak membuka kembali berita ekonomi atau kriminal.
