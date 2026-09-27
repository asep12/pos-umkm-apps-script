# SPEK: POS UMKM (Retail/Sembako + F&B) dengan Google Apps Script

Dokumen ini adalah spesifikasi untuk Claude Code. Bangun aplikasi sesuai isi dokumen, kerjakan per fase, dan berhenti di akhir tiap fase untuk diuji.

## 1. Tujuan

Aplikasi kasir (POS) satu paket untuk **satu UMKM per salinan Spreadsheet**. Bisa dipakai untuk:
- **Retail/sembako:** beli stok barang, jual barang.
- **F&B:** simpan stok bahan, olah jadi menu lewat resep, jual menu.
- **Campuran:** keduanya dalam satu toko.

Untuk toko lain, cukup copy Spreadsheet (script ikut ter-copy), jalankan Setup Awal, lalu deploy Web App.

## 2. Batasan dan Non-Goals

- **Tanpa multi-tenant.** Tidak ada ID klien atau outlet di tabel mana pun.
- **Tanpa payment API** (Midtrans/Xendit/dll.) untuk saat ini. Pembayaran dicatat manual oleh kasir.
- Tanpa framework build. Frontend HTML/CSS/JS biasa (vanilla) lewat HTML Service, tanpa npm bundler.
- Tidak ada ID Spreadsheet yang ditulis manual di kode. Selalu `SpreadsheetApp.getActive()`.
- Tidak ada data usaha yang di-hardcode (nama toko, alamat, PIN, dll.). Semua dari sheet `Pengaturan`.

## 3. Arsitektur

- **Database:** Google Sheets (satu Spreadsheet, beberapa sheet).
- **Backend:** Apps Script container-bound, fungsi diekspos ke frontend lewat `google.script.run`.
- **Frontend:** Web App (`HtmlService`), responsif untuk HP/tablet kasir (mobile-first), bahasa antarmuka **Bahasa Indonesia**.
- **Web App:** execute as *owner*, akses *siapa pun dengan link* (autentikasi lewat PIN aplikasi, lihat bagian 8).
- **Konkurensi:** `LockService.getScriptLock()` pada setiap operasi yang mengubah stok atau membuat nomor nota.
- **Cache:** `CacheService` untuk daftar item aktif dan pengaturan. Invalidate cache setiap ada perubahan item/harga/stok.

### Struktur file repo

```
/
  spek.md
  appsscript.json
  Code.gs            # doGet, menu onOpen, routing, helper umum
  Setup.gs           # Setup Awal (membuat sheet, header, data default)
  Auth.gs            # login PIN, sesi, cek role
  Item.gs            # CRUD item, harga, riwayat harga
  Stok.gs            # stok masuk, opname, koreksi, stok menipis
  Resep.gs           # CRUD resep
  Transaksi.gs       # buat transaksi, void, nomor nota
  Laporan.gs         # agregasi laporan
  Index.html         # shell + navigasi
  Css.html           # gaya (di-include)
  Js.html            # logika frontend (di-include)
  README.md          # cara pasang di toko baru
```

Gunakan pola `include('Css')` / `include('Js')` dengan `HtmlService.createTemplateFromFile`. Siapkan juga `.clasp.json.example` dan petunjuk `clasp push` di README.

## 4. Struktur Sheet

Semua sheet dibuat otomatis oleh Setup Awal. Baris 1 adalah header (tebal, dibekukan). Nama kolom persis seperti di bawah, agar kode bisa memetakan kolom berdasarkan nama header, bukan nomor kolom tetap.

### 4.1 `Item`
| Kolom | Keterangan |
|---|---|
| ID | Unik, format `ITM-0001`, otomatis |
| Kode | Kode/barcode, opsional, harus unik jika diisi |
| Nama | Wajib |
| Tipe | `Barang` / `Bahan` / `Menu` |
| Kategori | Teks bebas (dropdown dari kategori yang sudah ada) |
| Satuan | pcs, kg, gelas, porsi, dll. |
| Harga Beli | Angka. Untuk `Menu` = HPP, dihitung dari resep bila resep ada |
| Harga Jual | Angka. Kosong/0 untuk `Bahan` |
| Stok | Stok berjalan (angka, boleh desimal) |
| Stok Min | Batas peringatan stok menipis |
| Lacak Stok | `Ya` / `Tidak` |
| Aktif | `Ya` / `Tidak` (nonaktifkan, jangan hapus) |
| Foto | URL gambar, opsional |

### 4.2 `Resep`
| Kolom | Keterangan |
|---|---|
| ID Menu | Mengacu ke `Item.ID` bertipe `Menu` |
| ID Bahan | Mengacu ke `Item.ID` bertipe `Bahan` atau `Barang` |
| Qty | Jumlah bahan per 1 porsi menu (dalam satuan bahan) |

### 4.3 `Transaksi`
No Nota, Tanggal (datetime), Kasir, Subtotal, Diskon, Total, Metode (`Tunai`/`QRIS`/`Transfer`), Status (`Lunas`/`Menunggu`/`Batal`), Referensi, Bayar, Kembalian, Catatan.

### 4.4 `Detail`
No Nota, ID Item, Nama, Qty, Harga, Subtotal, HPP Satuan (disalin saat transaksi, untuk laba kotor yang akurat walau harga beli berubah).

### 4.5 `Stok_Log`
Tanggal, ID Item, Nama, Jenis (`Masuk`/`Keluar`/`Opname`/`Jual`/`Void`/`Koreksi`), Qty (positif = tambah, negatif = kurang), Stok Sesudah, Ref (no nota atau id pembelian), Kasir/User, Keterangan.

### 4.6 `Harga_Log`
Tanggal, ID Item, Harga Beli Lama, Harga Beli Baru, Harga Jual Lama, Harga Jual Baru, User.

### 4.7 `Pengguna`
Username, Nama, PIN Hash, Salt, Role (`Admin`/`Kasir`), Aktif.

### 4.8 `Pengaturan`
Format dua kolom `Kunci | Nilai`. Kunci minimal:
`NAMA_USAHA`, `ALAMAT`, `TELEPON`, `MODE_USAHA` (`Retail`/`F&B`/`Campuran`), `PAJAK_PERSEN` (default 0), `FOOTER_STRUK`, `LEBAR_STRUK` (58/80 mm), `PREFIX_NOTA` (default `INV`), `ZONA_WAKTU`, `VERSI`.

## 5. Aturan Bisnis Inti

### 5.1 Tipe item dan pemotongan stok
- **Barang:** dijual langsung; stok item itu berkurang sebesar qty terjual (jika Lacak Stok = Ya).
- **Bahan:** tidak dijual; hanya bertambah lewat stok masuk dan berkurang lewat resep.
- **Menu:** dijual. Jika punya baris di `Resep` dan Lacak Stok = Ya, maka stok **tiap bahan** dipotong sebesar `Qty resep x qty terjual`. Stok menu itu sendiri tidak dipakai. Jika belum punya resep atau Lacak Stok = Tidak, tidak ada stok yang dipotong.
- Resep bisa diisi belakangan; menu tanpa resep tetap bisa dijual.

### 5.2 Transaksi
- Semua perubahan (tulis Transaksi, Detail, potong stok, Stok_Log) berlangsung **dalam satu kunci** dan **batch** (`setValues`, bukan `appendRow` per baris di dalam loop).
- Validasi di **server**, bukan hanya di frontend: item aktif, qty > 0, harga diambil ulang dari sheet (jangan percaya harga dari klien), pembayaran cukup untuk metode Tunai.
- Stok tidak boleh minus untuk item yang dilacak, kecuali pengaturan `IZINKAN_STOK_MINUS = Ya`. Bila stok kurang, tolak dengan pesan yang menyebut item/bahan yang kurang.
- Nomor nota: `PREFIX-YYMMDD-0001`, urutan reset per hari, dibuat di dalam kunci agar tidak ganda.
- Kembalian = Bayar - Total (hanya untuk Tunai). QRIS/Transfer: Bayar = Total, isi Referensi opsional.
- Status default `Lunas`. Kolom Status disiapkan agar payment API bisa dipasang nanti tanpa ubah struktur.
- **Void:** hanya Admin. Status jadi `Batal`, stok dikembalikan (log jenis `Void`), baris asli tidak dihapus.

### 5.3 Stok
- Simpan **stok berjalan** di kolom `Item.Stok`. Jangan menghitung ulang dari log setiap transaksi. Log hanya untuk audit.
- **Stok masuk:** tambah stok, opsional update Harga Beli (catat di Harga_Log).
- **Opname:** input stok fisik, sistem menghitung selisih dan mencatat log `Opname`.
- **Stok menipis:** item dengan `Stok <= Stok Min` tampil di dashboard dan badge di daftar.

### 5.4 Harga
- Ubah harga jual dan harga beli dari layar Item; setiap perubahan dicatat di `Harga_Log`.
- Tampilkan margin otomatis: `(Harga Jual - Harga Beli) / Harga Jual`.
- HPP Menu = jumlah `Harga Beli bahan x Qty resep` (hitung otomatis saat resep/harga bahan berubah).

## 6. Fitur per Layar

1. **Kasir:** grid item (foto/inisial, nama, harga), pencarian, filter kategori/tipe, keranjang (ubah qty, hapus, catatan), diskon (nominal atau %), pilih metode bayar, input bayar, tombol nominal cepat (uang pas, 50rb, 100rb), kembalian otomatis, struk.
2. **Daftar Item:** tabel/kartu dengan cari, filter Tipe/Kategori/Aktif, badge stok menipis.
3. **Input/Edit Item:** form sesuai tipe. Field resep muncul hanya bila Tipe = Menu. Field foto opsional.
4. **Stok:** tab Stok Masuk, Opname, Riwayat (Stok_Log), Stok Menipis.
5. **Harga:** edit harga massal per kategori (opsional), riwayat harga per item.
6. **Laporan (Admin):** rentang tanggal, total penjualan, jumlah transaksi, laba kotor, produk terlaris, per metode bayar, per kasir. Tombol ekspor ke sheet baru atau PDF.
7. **Pengaturan (Admin):** edit Pengaturan, kelola Pengguna, tombol Void nota, cek versi.
8. **Struk:** tampilan cetak dari browser (`window.print()`) dengan CSS `@media print` sesuai `LEBAR_STRUK`. Isi: nama usaha, alamat, no nota, tanggal, kasir, item, subtotal, diskon, total, metode, bayar, kembalian, footer.

**Mode usaha:** `MODE_USAHA` menyembunyikan fitur yang tidak relevan. `Retail` menyembunyikan Resep dan tipe Bahan/Menu; `F&B` menampilkan semua; `Campuran` menampilkan semua.

## 7. Kontrak Fungsi Backend

Semua fungsi publik menerima `token` sesi sebagai argumen pertama (kecuali `login`) dan mengembalikan objek `{ ok: true, data }` atau `{ ok: false, pesan }`. Tangkap semua error di dalam fungsi, jangan lempar ke klien.

- Auth: `login(username, pin)`, `logout(token)`, `infoSesi(token)`
- Pengaturan: `getPengaturan(token)`, `simpanPengaturan(token, obj)`
- Item: `listItem(token, filter)`, `simpanItem(token, item)`, `setAktifItem(token, id, aktif)`, `riwayatHarga(token, id)`
- Resep: `getResep(token, idMenu)`, `simpanResep(token, idMenu, baris[])`
- Stok: `stokMasuk(token, {idItem, qty, hargaBeli?, ket})`, `opname(token, [{idItem, stokFisik}], ket)`, `listStokLog(token, filter)`, `listStokMenipis(token)`
- Transaksi: `buatTransaksi(token, {items:[{idItem, qty}], diskon, metode, bayar, referensi, catatan})`, `getNota(token, noNota)`, `listTransaksi(token, filter)`, `voidTransaksi(token, noNota, alasan)`
- Laporan: `laporanRingkas(token, {dari, sampai})`, `laporanTerlaris(token, {dari, sampai, limit})`
- Sistem: `setupAwal()` (dipanggil dari menu Spreadsheet, bukan dari web)

## 8. Autentikasi dan Keamanan

- Login **username + PIN** (4-6 digit). Simpan `SHA-256(salt + PIN)` dengan `Utilities.computeDigest`; PIN tidak pernah disimpan polos.
- Sesi: token acak (`Utilities.getUuid()`) disimpan di `CacheService` (masa berlaku 6 jam, diperpanjang saat aktif) dengan isi username dan role. Klien menyimpan token di `sessionStorage`.
- Setiap fungsi backend memverifikasi token dan role di server. Fungsi Admin-only: laporan, void, kelola pengguna, simpan pengaturan, ubah harga.
- Batasi percobaan login: 5 kali salah per username dalam 10 menit lalu kunci sementara (hitung di `CacheService`).
- Setup Awal membuat satu akun Admin default; **paksa ganti PIN** pada login pertama.
- Escape semua teks dari pengguna saat dirender di HTML (hindari XSS). Gunakan `textContent`, bukan `innerHTML`, untuk data dinamis.
- Jangan tulis PIN, hash, atau token ke log/`Logger`.

## 9. Setup Awal

Menu kustom `onOpen` di Spreadsheet: **POS > Setup Awal**. Fungsi ini harus **idempotent** (aman dijalankan berulang):
1. Buat sheet yang belum ada, lengkap dengan header, pembekuan baris, dan validasi data (dropdown Tipe, Lacak Stok, Aktif, Metode, Status, Role).
2. Isi `Pengaturan` dengan nilai default hanya untuk kunci yang belum ada.
3. Buat akun Admin default bila `Pengguna` kosong.
4. Tulis `VERSI` dari konstanta di kode.
5. Tampilkan dialog ringkasan hasil dan instruksi deploy.

Sediakan juga **POS > Contoh Data** (opsional) yang mengisi beberapa item contoh Barang dan Menu berikut resepnya untuk uji coba.

## 10. Performa dan Kualitas Kode

- Baca sheet sekali per permintaan (`getDataRange().getValues()`), proses di memori, tulis balik dengan `setValues` untuk blok besar. Jangan panggil `getRange` di dalam loop.
- Cache daftar item aktif (`CacheService`, TTL 5-10 menit) dan hapus cache setiap kali item, harga, atau stok berubah. Ingat batas 100 KB per kunci cache; pecah kunci jika perlu.
- Semua angka uang disimpan sebagai angka (bukan teks). Format rupiah hanya di tampilan (`Intl.NumberFormat('id-ID')`).
- Tanggal disimpan sebagai `Date`; zona waktu diambil dari Pengaturan/`Session.getScriptTimeZone()`.
- Fungsi kecil dan bernama jelas, komentar Bahasa Indonesia seperlunya, tanpa variabel global yang bermutasi.
- Tangani kasus tepi: sheet kosong, item terhapus/nonaktif saat ada di keranjang, dua kasir menjual item terakhir bersamaan (diatasi kunci + validasi ulang stok di server).

## 11. Tahapan dan Kriteria Selesai

### Fase 1: MVP
Cakupan: struktur repo, `appsscript.json`, Setup Awal, CRUD Item (Barang dan Menu, resep sederhana), layar Kasir, `buatTransaksi` dengan potong stok (langsung dan lewat resep), struk browser, login PIN dasar.
Selesai bila:
- Setup Awal berhasil di Spreadsheet kosong dan aman dijalankan ulang.
- Menjual 1 Barang mengurangi stok barang tersebut, tercatat di `Stok_Log`.
- Menjual 1 Menu ber-resep mengurangi stok tiap bahan sesuai Qty resep.
- Penjualan melebihi stok ditolak dengan pesan jelas.
- Dua transaksi cepat berturut-turut menghasilkan nomor nota berbeda.
- Struk tercetak rapi di browser.

### Fase 2: Stok dan Role
Stok masuk, opname, stok menipis, riwayat harga, peran Admin/Kasir penuh, void nota, `MODE_USAHA` yang menyembunyikan fitur.

### Fase 3: Laporan
Laporan harian/bulanan, terlaris, laba kotor, per metode bayar, ekspor ke sheet/PDF, dashboard ringkas.

### Fase 4: Poles (opsional)
Barcode scanner kamera, printer thermal Bluetooth (RawBT), varian/topping F&B, satuan konversi (beli karung 25 kg, jual per kg), bill terbuka/meja, mode offline ringan.

## 12. Ditunda (jangan dikerjakan sekarang)

- Integrasi payment API (Midtrans/Xendit) dan webhook. Kolom `Status` dan `Referensi` sudah disiapkan agar bisa ditambahkan tanpa ubah struktur.
- Multi-outlet dan multi-tenant.

## 13. Cara Kerja untuk Claude Code

1. Kerjakan satu fase pada satu waktu, mulai Fase 1. Jangan loncat ke fase berikutnya sebelum diminta.
2. Sebelum menulis kode, tampilkan rencana file dan fungsi yang akan dibuat; tunggu persetujuan bila ada keputusan yang belum dijelaskan di dokumen ini.
3. Setelah selesai, buat/perbarui `README.md` berisi: cara pasang di toko baru (copy Spreadsheet, Setup Awal, deploy Web App), cara update versi ke banyak salinan (`clasp`), dan daftar pengujian manual sesuai kriteria fase.
4. Karena Apps Script tidak bisa dijalankan lokal, sertakan checklist uji manual yang jelas, dan tulis fungsi murni (hitung total, hitung potong stok) terpisah agar mudah diuji dengan pemanggilan fungsi tes di editor.
