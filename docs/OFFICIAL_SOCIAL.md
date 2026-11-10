# Jalur resmi monitoring media sosial

Status **v0.1.4**: persiapan integrasi. Semua credential dan target API dalam `.env.example` sengaja kosong. Tidak ada pengambilan data sosial yang aktif, tidak ada request platform, dan belum ada alur OAuth, collector live, refresh token, ataupun sinkronisasi berkala.

Sesuai keputusan pemilik, X, Threads, Instagram, Facebook, dan TikTok **hanya menggunakan jalur resmi**. Adapter RSS sosial dihapus dari runtime dan contoh konfigurasinya dihapus. `SOCIAL_CONFIG` serta `config/social.json` tidak lagi dibaca; cache RSS sosial lama tidak dimuat. RSS berita ANTARA/detik tetap dipakai untuk berita.

## Yang sudah disiapkan

- Registry lima provider beserta produk resmi, template endpoint, dokumentasi, kebutuhan akses, dan batas cakupan.
- Kontrak `OfficialSocialPost` untuk hasil collector resmi di masa mendatang.
- Normalisasi ke format laporan PANTAU: identitas per platform, waktu publikasi, permalink resmi, status `reported`, serta kebijakan prioritas HAM. Kontrak ini diuji dengan fixture; tidak dipanggil untuk menghasilkan data simulasi.
- Endpoint status `GET /api/social/providers`, mengikuti `PANTAU_API_TOKEN`.
- Status terpisah untuk lima sumber pada `/api/situation` dan kartu kanal di dashboard.
- Placeholder credential server-side dalam `.env.example`; nilai tidak dikembalikan dalam API atau dikirim ke frontend.
- Tidak ada flag yang bisa menyalakan collector pada versi ini. Mengisi token saja tetap menghasilkan status **menunggu implementasi**.

## Jalur per platform

| Platform  | Produk / jalur yang direncanakan                             | Akses yang diperlukan                                                                                    | Batas cakupan                                                                                                          |
| --------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| X         | X API v2, `GET /2/tweets/search/recent`                      | Developer app, Bearer token, query, dan paket/kuota yang mendukung endpoint                              | Pencarian recent sesuai hak akses paket, bukan jaminan seluruh unggahan                                                |
| Threads   | Threads API, `GET /keyword_search`                           | Meta app, OAuth Threads, akses `threads_basic` dan `threads_keyword_search` sesuai review yang berlaku   | Ketersediaan hasil publik mengikuti izin/review; bukan scraper                                                         |
| Instagram | Instagram API with Facebook Login, `GET /{ig-user-id}/media` | Akun profesional berizin, relasi Page yang sesuai, OAuth, permission baca Instagram, dan versi Graph API | Media akun yang memberi akses. Hashtag Search/Business Discovery adalah perluasan terpisah sesuai akses yang disetujui |
| Facebook  | Pages API, `GET /{page-id}/posts`                            | Page access token, Page ID, versi Graph API, dan permission baca Page yang berlaku                       | Unggahan Page sesuai izin. Tidak berarti pencarian seluruh profil/grup atau bebas membaca Page pihak lain              |
| TikTok    | Display API, `POST /v2/video/list/`                          | Developer app, Login Kit dan Display API disetujui, OAuth pengguna, scope `video.list`                   | Video publik pengguna yang memberi izin, bukan pencarian seluruh TikTok                                                |

Instagram memakai jalur Facebook Login pada registry ini; jangan mencampurkan token atau nama permission dengan jalur Instagram Login tanpa penyesuaian adapter. `instagram_basic` dan permission terkait Page perlu diverifikasi terhadap penggunaan/app yang dipilih saat implementasi. Untuk Facebook, `pages_read_engagement` dan akses lain mengikuti data serta Page yang dibaca. Tidak ada permintaan permission tulis, publish, pesan pribadi, atau pengelolaan akun pada tahap ini.

**Meta Content Library** dan **TikTok Research Tools** merupakan jalur penelitian terpisah. Kelayakan organisasi/wilayah, lingkungan komputasi, ketentuan ekspor, dan izin publikasi ulang perlu diperiksa. Keduanya tidak diperlakukan sebagai API publik bebas untuk dashboard. Mode riset tidak diaktifkan atau disamarkan sebagai Display API.

## Placeholder konfigurasi

Variabel yang diperiksa untuk menentukan apakah persiapan tiap provider lengkap:

| Provider  | Credential                   | Target / versi                                             |
| --------- | ---------------------------- | ---------------------------------------------------------- |
| X         | `X_BEARER_TOKEN`             | `X_SEARCH_QUERY`                                           |
| Threads   | `THREADS_ACCESS_TOKEN`       | `THREADS_SEARCH_QUERY`                                     |
| Instagram | `INSTAGRAM_ACCESS_TOKEN`     | `INSTAGRAM_USER_ID`, `META_GRAPH_VERSION`                  |
| Facebook  | `FACEBOOK_PAGE_ACCESS_TOKEN` | `FACEBOOK_PAGE_ID`, `META_GRAPH_VERSION`                   |
| TikTok    | `TIKTOK_ACCESS_TOKEN`        | Identitas akun mengikuti token yang mengotorisasi aplikasi |

Placeholder tambahan untuk implementasi OAuth/refresh di kemudian hari:

```dotenv
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_REDIRECT_URI=
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=
TIKTOK_REFRESH_TOKEN=
```

Tidak ada callback OAuth yang tersedia saat ini. Redirect URI, versi API, app ID, token, dan query tidak diisi dengan nilai contoh yang terlihat seolah aktif. Jangan menaruh credential di `VITE_*`, URL, README, atau Git. Nanti credential diisi melalui secret manager deployment atau `.env` yang diabaikan Git, bukan melalui chat.

## Makna status

Respons `/api/social/providers` mempunyai `policy: "official-only"` dan `enabled: false`. Tiap provider memiliki:

- `configuration_missing`: ada variabel yang belum diisi.
- `implementation_pending`: variabel yang diperiksa sudah terisi, tetapi **belum divalidasi** dan collector masih belum diimplementasikan.
- `credentialsPresent`: hanya menyatakan ada nilai pada variabel credential; bukan bukti token valid, izin lengkap, atau akun terhubung.
- `enabled: false` dan `collectorImplemented: false` selalu, sampai implementasi aktual dilakukan.

API mengembalikan nama variabel yang belum diisi dan metadata jalur, tidak mengembalikan nilai token, ID akun, query, app secret, atau refresh token. `/api/situation` menampilkan lima sumber sebagai `unconfigured`, `count: 0`, dan `fetchedAt: null`. Angka nol itu menandakan belum ada pengambilan data, bukan hasil pencarian tanpa temuan.

## Tahap implementasi nanti

1. Tetapkan daftar akun/Page atau query yang relevan dengan kebijakan monitoring PANTAU.
2. Daftarkan aplikasi pada developer portal resmi; pilih produk, versi, permission dan paket yang sesuai, lalu selesaikan review/otorisasi bila diperlukan.
3. Isi credential di server. Verifikasi identitas akun, scope, expiry, refresh/revoke, dan cakupan izin. Pastikan credential yang dipakai adalah milik instans ini.
4. Tulis collector yang benar-benar memanggil endpoint resmi. Tambahkan batas request, pagination, kuota, timeout, retry/backoff, serta penanganan 401/403/429 tanpa membocorkan token.
5. Validasi respons platform sebelum meneruskannya sebagai `OfficialSocialPost`. Normalizer menolak waktu yang tidak lengkap, permalink di domain yang salah, teks kosong, dan topik yang dikecualikan; laporan HAM diprioritaskan sesuai kebijakan.
6. Hubungkan collector ke pipeline cache PANTAU, dengan identitas sumber stabil, waktu publikasi/pengambilan, serta status stale/error yang jelas. Atur penghapusan konten, retensi, atribusi, dan penayangan sesuai ketentuan API.
7. Uji dengan akun/akses yang sah; baru setelah itu aktifkan kanal. Tidak ada fallback ke RSS sosial, scraper, sesi browser, atau API pihak ketiga.

Kontrak normalisasi menyimpan teks hingga 600 karakter dan tidak memberi koordinat otomatis. Penyebutan kota pada caption bukan bukti geotag unggahan. Status `reported` dipertahankan walaupun pengambilan dilakukan lewat API resmi; platform resmi tidak otomatis memverifikasi kebenaran klaim.

## Referensi primer

Dokumentasi ditinjau 10 November 2026. Cakupan, versi, izin, paket dan persyaratan platform dapat berubah; verifikasi lagi saat implementasi.

- [X Recent Search](https://docs.x.com/x-api/posts/search-recent-posts).
- [Meta Threads — Search for Threads Posts](https://www.postman.com/meta/threads/request/34203612-b3b2c12a-7ce6-4d86-a3c6-6d31e3b66ea1).
- [Meta Instagram — official API workspace](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api).
- [Meta Pages API — Posts](https://developers.facebook.com/docs/pages-api/posts/). Pengambilan otomatis halaman ini mendapat HTTP 429 saat pemeriksaan; detail izin perlu dicek kembali di developer portal ketika implementasi.
- [TikTok Display API — List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list).
- [Meta Content Library / SOMAR](https://www.icpsr.umich.edu/sites/somar/meta-content-library).
- [TikTok Research Tools](https://developers.tiktok.com/products/research-api/).

## Verifikasi persiapan

Tes memeriksa kelima jalur, placeholder kosong, status tetap dorman meski diberi nilai dummy, tidak bocornya credential, prioritas HAM saat normalisasi fixture, validasi permalink/timestamp, kontrol akses endpoint status, dan tidak termuatnya cache RSS sosial lama. Tidak ada tes live ke platform sosial karena credential dan izin belum tersedia dan koleksinya memang belum diaktifkan.
