# Dashboard tiga kanal — v0.1.7

Navigasi utama berada di kiri pada desktop dan menjadi bilah bawah pada layar hingga 760 px. Konten hanya menampilkan kanal yang dipilih. Pindah kanal mempertahankan isian filter, mengembalikan posisi halaman ke atas, dan menyesuaikan ukuran Leaflet saat peta dibuka kembali.

| Kanal                  | Alamat dalam aplikasi | Isi                                                                                                                     |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Peta & Ringkasan       | `#peta`               | Peta laporan, empat indikator, tiga topik terbanyak dan maksimal tiga sorotan terbaru; panel CCTV, cuaca dan lingkungan |
| Kanal Berita · Terkini | `#berita`             | Laporan penerbit RSS, pencarian, kategori, sumber, waktu dan filter lokasi                                              |
| Kanal Berita · Arsip   | `#berita/arsip`       | Pencarian arsip, kriteria/lokasi awal, teks lengkap, foto/caption, riwayat dan unduhan                                  |
| Kanal Medsos           | `#medsos`             | Pilihan platform serta kesiapan API resmi X, Threads, Instagram, Facebook dan TikTok                                    |

Alamat dapat disalin, dibuka langsung, serta dinavigasi dengan Back/Forward browser. Subtab berita mendukung tombol panah kiri/kanan, Home dan End. Navigasi utama menggunakan tautan dengan penanda `aria-current`; subtab menggunakan `tablist`, `tab`, dan `tabpanel`.

## Peta dan berita mempunyai filter terpisah

Peta memfilter topik, wilayah yang sudah terpetakan, dan waktu 6/24/72 jam. Empat indikator, topik/sorotan, pin laporan, serta ekspor GeoJSON mengikuti filter peta. Jumlah sumber aktif adalah kesehatan sumber keseluruhan, bukan jumlah sumber yang berkontribusi pada wilayah pilihan. Kamera dan titik arsip/pilihan tidak masuk hitungan laporan atau ekspor laporan.

Kanal Berita memfilter judul/ringkasan, sumber, kategori, waktu dan ada/tidaknya lokasi secara terpisah. Data sensor BMKG/FIRMS serta unggahan sosial tidak masuk daftar berita penerbit. Pencarian berita tidak mengubah indikator/pin peta. Aplikasi meminta snapshot sampai 72 jam, lalu menerapkan jendela setiap kanal di klien; cakupan tetap bergantung pada feed, waktu publikasi dan batas respons API.

Klik pin/sorotan membuka ringkasan bersumber. Berita penerbit mempunyai tombol **Teks lengkap, foto & arsip**, yang membuka catatan arsip berdasarkan kanal dan URL kanonis; artikel belum terarsip ditandai sebagai belum tersedia. Detail tetap menunjukkan status pengambilan halaman/foto, termasuk antrean dan kegagalan. Klik **Lihat di peta** mengembalikan navigasi ke peta; laporan di luar filter diberi titik pilihan terpisah dengan penjelasan, tanpa mengubah filter atau hitungannya.

Arsip kini merupakan panel dalam Kanal Berita. Detail satu artikel tetap berupa dialog agar teks lengkap, foto dan riwayat dapat dibaca tanpa kehilangan pencarian. Tombol lokasi arsip berpindah ke peta dengan label ARSIP. Penyimpanan, backup dan kriteria preservasi mengikuti [panduan arsip](NEWS_ARCHIVE.md).

## CCTV sebagai konteks wilayah

Tombol **CCTV** membuka/menutup panel kamera di halaman peta. Daftar kamera tetap mendukung HLS dan tautan eksternal. Tidak ada stream yang dimuat sebelum pengguna membukanya. Tutup pemutar menghentikan playback dan membuang instance HLS.

Konfigurasi lama pada `config/cameras.json` tetap berlaku. Operator dapat menambahkan objek opsional `location` berisi angka `lat` dan `lon` untuk koordinat kamera yang diketahui. Latitude harus berada pada -90 sampai 90 dan longitude -180 sampai 180. Nilai kosong, string, nonfinite, atau di luar rentang ditolak. Lokasi tidak ditebak dari nama kota/wilayah.

Pilihan **Tampilkan kamera berkoordinat pada peta** menyalakan layer kamera berikon tersendiri. Kamera tanpa koordinat hanya tersedia di daftar. Jika tidak ada koordinat, pilihan layer dinonaktifkan. Pin memberi nama, wilayah, keterangan asal koordinat konfigurasi, dan tombol membuka kamera/sumber. Pin tidak menyatakan kamera sedang online atau bahwa kejadian berlangsung di lokasi kamera; kondisi stream baru diperiksa saat dibuka.

Belum ada sumber CCTV aktif bawaan. Versi ini menyiapkan navigasi dan peta untuk kamera yang dikonfigurasi operator, tanpa menambah URL atau koordinat kamera contoh sebagai data produksi.

## Panel lainnya

Kesehatan sumber dibuka dari header sehingga tidak mengambil kolom pada peta. Tombol sinkronisasi serta pengaturan token juga tetap tersedia pada desktop dan ponsel. Cuaca serta ringkasan udara/biodiversitas berada dalam panel yang dapat dibuka, sementara kontrol lapisan raster/vektor tetap dekat peta.

Kanal Medsos menampilkan status yang sebenarnya: kelima integrasi resmi masih dorman. Pemilihan platform menyaring kartu status, bukan mengambil unggahan. Tidak ada data sosial contoh yang disajikan sebagai hasil monitoring.

## Verifikasi

Tes DOM menjalankan bundle antarmuka dengan API fixture dan Leaflet, memeriksa perpindahan tiga kanal, subtab arsip, filter yang terpisah, panel CCTV, pin untuk koordinat yang tersedia, dan tidak adanya request stream sebelum interaksi. Tes terpisah memeriksa navigasi keyboard/deep link serta kontrol akses dan pencocokan URL arsip. Fixture kamera/berita hanya dipakai dalam tes.

Simulasi DOM tidak menguji tata letak visual, rendering raster, atau playback video. Browser bersama tidak tersedia pada sesi ini; screenshot, pemeriksaan responsif di browser, fokus modal secara visual dan HLS live belum diverifikasi. Lihat [catatan validasi](VALIDATION.md).
