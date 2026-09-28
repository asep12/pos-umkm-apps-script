# SECURITY.md

## 1. Model Ancaman
- Web App dapat diakses **siapa pun yang punya URL** dan berjalan **sebagai pemilik**. Bug otorisasi = penyerang
  bertindak dengan hak pemilik atas Spreadsheet.
- `google.script.run` dapat memanggil **setiap fungsi top-level tanpa akhiran `_`**, bukan hanya yang dipakai UI.
- Kasir adalah pengguna tepercaya-sebagian: bisa berjualan, tidak boleh mengubah harga, laporan, atau menghapus jejak.

## 2. Permukaan API
- Fungsi internal **wajib** berakhiran `_`. Fungsi publik hanya yang terdaftar di `API.md` §4.
- `setupAwal`, `contohData`: publik karena dipanggil menu, tetapi diawali `pastikanDariSpreadsheet_()`
  (memanggil `SpreadsheetApp.getUi()`; gagal di konteks Web App → tolak).
- `jalankanTes`: hanya fungsi murni, tidak menulis sheet.

## 3. Autentikasi
- Username + PIN 4–6 digit. Simpan `SHA-256(salt + PIN)` (`Utilities.computeDigest`), salt acak per pengguna (`Utilities.getUuid()`).
- PIN pendek mudah di-brute-force **jika hash bocor** → Spreadsheet tidak boleh dibagikan ke kasir; kasir hanya diberi URL Web App.
- Batas percobaan: 5 gagal per username / 10 menit → `TERKUNCI`. Pesan gagal login sama untuk username salah maupun PIN salah.
  Cek batas, verifikasi, dan pencatatan gagal berjalan **di dalam `denganKunci_`** (login & ganti PIN): tanpa kunci,
  permintaan paralel membaca hitungan yang sama sehingga batas 5 bisa dilampaui berkali-kali lipat.
- Username Admin bawaan `admin` mudah ditebak dan URL Web App bisa diakses siapa saja yang memegangnya, jadi kekuatan
  PIN Admin adalah pertahanan utama: dengan 5 tebakan/10 menit, PIN 4 digit (10.000 kemungkinan) jauh lebih lemah
  daripada 6 digit (1.000.000). Setup Awal membuat PIN Admin acak 6 digit.
- Admin default dibuat Setup Awal: username `admin`, PIN **acak 6 digit** ditampilkan sekali di dialog Setup, `Ganti PIN = Ya`.
- PIN baru tidak boleh sama dengan PIN lama dan tidak boleh pola lemah (`000000`, `123456`, semua digit sama).

## 4. Sesi
- Token `Utilities.getUuid()`, disimpan di `CacheService` script cache: `sesi:<token>` → `{u, r, gp}`; TTL 6 jam, diperpanjang saat aktif.
- Klien menyimpan token di `sessionStorage` (hilang saat tab ditutup).
- Setiap panggilan memeriksa ulang bahwa pengguna **masih Aktif** dan role terbaru (dari cache Pengguna berversi) — penonaktifan kasir langsung berlaku.
- Role & username **selalu** dari sesi server, tidak pernah dari argumen klien.

## 5. Otorisasi (ringkas, detail di `API.md`)
| Kemampuan | Kasir | Admin |
|---|---|---|
| Jual, cetak/cetak ulang struk, lihat daftar item (termasuk angka stok) | ✔ | ✔ |
| Buka/tutup shift sendiri, catat kas selama shift sendiri | ✔ | ✔ |
| Simpan/ubah/bayar/batalkan bill terbuka | ✔ | ✔ |
| Ubah harga massal | ✘ | ✔ |
| Catat kas toko tanpa shift, tutup shift kasir lain, riwayat shift & arus kas | ✘ | ✔ |
| Stok masuk, riwayat & stok menipis | ✘ | ✔ |
| Tambah/ubah item, harga, resep, opname | ✘ | ✔ |
| Void, laporan, pengaturan, pengguna | ✘ | ✔ |

## 6. Validasi Input
- Semua validasi diulang di server (frontend hanya kenyamanan). Tolak field tak dikenal, tipe salah, angka non-finite/negatif.
- Harga, HPP, stok, nomor nota, tanggal transaksi, nama kasir **dihitung server**.
- Batas panjang teks (nama 100, catatan 200 karakter). Teks yang ditulis ke sheet melalui `amanSel_()` (cegah formula injection `=IMPORTXML(...)`).

## 7. Frontend
- Data dinamis dirender dengan `textContent` / `createElement`. **Dilarang** `innerHTML`, `insertAdjacentHTML`, atau template string HTML untuk data.
- URL foto hanya `https://`; dipasang via `img.src`, bukan HTML.
- Templating server: `<?!= include() ?>` hanya untuk file statis; satu-satunya data yang dicetak ke template adalah nama toko lewat `<?= ?>` (otomatis di-escape).
- Grafik SVG dibuat lewat `createElementNS` + `textContent`, sama aturannya dengan elemen HTML.
- Sumber eksternal hanya Google Fonts (CSS/font). Tidak ada skrip pihak ketiga (scan barcode memakai BarcodeDetector bawaan browser).
- RawBT: struk dikirim ke aplikasi lokal lewat tautan `intent:` dari ketukan pengguna; tidak ada server pihak ketiga.
- Kamera: hanya aktif selama modal scan terbuka dan dimatikan saat modal ditutup; foto barcode tidak diunggah ke mana pun.

## 8. Log & Error
- Jangan pernah menulis PIN, hash, salt, atau token ke `Logger`/`console`.
- Error tak terduga: klien hanya menerima `kode: 'SERVER'` + pesan umum; detail (tanpa data sensitif) ke `console.error`.
- Jejak audit bisnis ada di `Stok_Log`, `Harga_Log`, status `Transaksi` — append-only.

## 9. Rahasia & Scope
- Proyek ini tidak memerlukan API key. Bila nanti perlu (payment API), simpan di `PropertiesService`, **bukan** di kode atau sheet.
- `oauthScopes` eksplisit & minimal di manifest (`spreadsheets.currentonly`, `script.container.ui`; `drive.file` baru di Fase 3 untuk ekspor PDF).

## 10. Aturan untuk AI Agent
- Jangan menghapus pengecekan token/role agar fitur "jalan".
- Jangan menambah fungsi publik baru tanpa mencantumkannya di `API.md` beserta role-nya.
- Jangan mempercayai nilai dari klien untuk harga, role, username, atau stok.
- Tanyakan bila perubahan bertentangan dengan dokumen ini.
