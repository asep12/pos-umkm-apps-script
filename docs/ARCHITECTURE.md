# ARCHITECTURE.md

## 1. Gambaran

```
 HP/Tablet Kasir (browser)                     Google (akun pemilik toko)
┌───────────────────────────┐   google.script.run   ┌──────────────────────────────┐
│ Index.html + Css + Js     │ ────────────────────▶ │ Apps Script (execute as owner)│
│ - SPA, navigasi via state │ ◀──────────────────── │  API publik  → jalankan_()    │
│ - token di sessionStorage │   {ok,data}|{ok,pesan}│  Logika murni (Logika.js)     │
└───────────────────────────┘                       │  Db.js  ⇄  Spreadsheet aktif  │
                                                    │  CacheService / LockService   │
                                                    └──────────────────────────────┘
```

- **Satu Spreadsheet = satu toko.** Script ikut ter-copy saat Spreadsheet di-copy.
- Web App: *Execute as: Me (owner)*, *Who has access: Anyone*. Autentikasi oleh aplikasi (PIN), bukan akun Google.
- Konsekuensi: setiap fungsi publik berjalan dengan hak penuh pemilik → semua pemeriksaan keamanan ada di server (lihat `SECURITY.md`).

## 2. Peta File

| File | Isi | Catatan |
|---|---|---|
| `appsscript.json` | Manifest: V8, zona waktu, webapp, oauthScopes | |
| `Code.js` | `doGet`, `include`, `onOpen` (menu POS), `jalankan_` (pembungkus API), `galat_` | |
| `Db.js` | `SKEMA` (nama sheet + header), `bacaTabel_`, `bacaHeader_`, `telusuriMundur_`, `tambahObjek_`, `tulisKolom_`, `amanSel_`, cache helper | **Tambahan** dari spek: memisahkan akses sheet |
| `Logika.js` | Fungsi murni: `hitungTransaksi_`, `hitungKebutuhanStok_`, `cekStok_`, `hitungHppMenu_`, `formatNomorNota_`, `bulatUang_`, `bulatQty_` | **Tambahan**: tanpa `SpreadsheetApp`, mudah dites |
| `Tes.js` | `jalankanTes()` + kasus uji fungsi murni | **Tambahan**: dijalankan dari editor |
| `Setup.js` | `setupAwal`, `contohData`, migrasi kolom | |
| `Contoh.js` | `katalogContoh_` (±55 item + resep), `isiContohData_` | Idempoten per nama; barcode EAN-13 awalan 200 |
| `Auth.js` | `login`, `logout`, `infoSesi`, `gantiPin`, hash PIN, batas percobaan | |
| `Pengaturan.js` | `getPengaturan`, `simpanPengaturan`, `listPengguna`, `simpanPengguna` | Dipisah dari Code.js agar Code.js ramping |
| `Item.js` | `listItem`, `simpanItem`, `setAktifItem`, `riwayatHarga`, `muatAwal`, `ubahHargaMassal`, `imporItem`, `ringkasPersediaan`, `labelItem` | |
| `Resep.js` | `getResep`, `simpanResep`, hitung ulang HPP menu | |
| `Stok.js` | `stokMasuk`, `opname`, `listStokLog`, `listStokMenipis` | Fase 2 |
| `Transaksi.js` | `buatTransaksi`, `getNota`, `listTransaksi`, `voidTransaksi`, nomor nota | Void mengembalikan stok dari baris `Jual` di Stok_Log |
| `Bill.js` | `listBill`, `simpanBill`, `batalBill`; bill dibayar lewat `buatTransaksi(idBill, versiBill)` | Versi = waktu Diperbarui (detik) |
| `Kas.js` | `infoShift`, `bukaShift`, `catatKas`, `tutupShift`, `getShift`, `listShift`, `listKas` | Rekap shift = `rekapShift_` (Logika.js) |
| `Laporan.js` | `dashboard`, `laporanRingkas`, `laporanTerlaris`, `eksporLaporan`, `kumpulkanPenjualan_` | Angka dihitung `ringkasPenjualan_` (Logika.js) |
| `Index.html` | Shell: layar login, navigasi, kerangka tiap layar, area struk | |
| `Css.html` | Gaya mobile-first + `@media print` struk | |
| `Js.html` | `api()`, navigasi, state, render per layar, keranjang, struk | Boleh dipecah (`JsKasir.html`, dll.) bila terlalu besar |
| `dev/` | `emulator.js` (tiruan layanan Apps Script), `uji-e2e.js`, `server.js` | Tidak di-push; untuk uji lokal |
| `scripts/` | `update-semua-toko.ps1` | Push + update deployment banyak toko |

Lokal memakai ekstensi `.js`; `clasp` mengubahnya menjadi `.gs` di server. `.claspignore` mengecualikan `docs/`, `*.md`.

## 3. Siklus Request

1. Frontend memanggil `api('namaFungsi', arg...)` → otomatis menyisipkan token.
2. Fungsi publik backend hanya satu baris: `return jalankan_(token, ROLE, function (sesi) {...})`.
3. `jalankan_` : validasi token & role → jalankan isi → bungkus hasil `{ok:true,data}`; tangkap error →
   `{ok:false, kode, pesan}` (error tak terduga → pesan umum, detail ke `console.error` tanpa data sensitif).
4. Frontend: `kode === 'SESI_HABIS'` → kembali ke layar login; selain itu tampilkan `pesan` sebagai toast.

## 4. Alur `buatTransaksi` (inti sistem)

```
validasi token & bentuk input (di luar kunci)
└─ denganKunci_ (LockService.getScriptLock, tunggu maks 10 dtk → kode SIBUK)
   ├─ baca Item, Resep, Pengaturan SEGAR (bukan dari cache)
   ├─ hitungTransaksi_()   → harga dari sheet, subtotal, diskon, pajak, total, kembalian, HPP satuan
   ├─ hitungKebutuhanStok_() → peta {idItem: qty} (Barang langsung + bahan dari resep, DIGABUNG)
   ├─ cekStok_()           → tolak dengan daftar item/bahan yang kurang (kecuali IZINKAN_STOK_MINUS)
   ├─ nomorNota_()         → PREFIX-YYMMDD-NNNN (counter di ScriptProperties, reset per hari)
   ├─ tulis batch: Transaksi (1 baris), Detail (n baris), Stok_Log (m baris), kolom Stok Item (1 setValues)
   └─ SpreadsheetApp.flush()
naikkan versi cache item → kembalikan data nota untuk struk
```

Semua penulisan yang menyentuh sheet `Item` (simpan item, stok masuk, opname, void) **juga** memakai kunci yang sama,
agar kolom Stok yang ditulis ulang tidak menimpa perubahan lain.

## 4b. Membaca Sheet yang Terus Membesar

Transaksi, Detail, Stok_Log, Harga_Log hanya ditambah di bawah (kronologis). Riwayat & pencarian nota memakai
`telusuriMundur_`: dibaca per blok 2.000 baris dari bawah, berhenti saat tanggal sudah lebih lama dari rentang
atau data ditemukan. Menambah baris cukup membaca header (`bacaHeader_`).

## 5. Strategi Cache (`CacheService.getScriptCache()`)

| Kunci | Isi | TTL | Invalidasi |
|---|---|---|---|
| `sesi:<token>` | `{u, r, gp}` (username, role, wajib ganti PIN) | 6 jam, diperpanjang | logout / ganti PIN |
| `gagal:<username>` | jumlah login gagal | 10 menit | login sukses |
| `item:v<N>:<i>` | daftar item dipecah per ~90 KB | 10 menit | naikkan `ITEM_VER` (ScriptProperties) |
| `atur:v<N>` | Pengaturan | 10 menit | naikkan `ATUR_VER` |
| `user:v<N>` | Pengguna (tanpa hash/salt) | 10 menit | naikkan `USER_VER` |

Invalidasi dengan **menaikkan nomor versi** (bukan menghapus banyak kunci) → kunci lama kedaluwarsa sendiri.
Operasi transaksi & stok **tidak pernah** memakai cache untuk validasi.

## 6. Frontend

- **Kerangka**: ≥ 900px sidebar (rel ikon 84px; ≥ 1280px sidebar penuh 236px berlabel); < 900px topbar + navigasi bawah.
  Menu dibangun JS dari konstanta `MENU` sesuai role, berkelompok (Menu utama / Inventori / Transaksi / Laporan & sistem).
  HP: maks 4 menu + "Lainnya" (Admin: Beranda, Kasir, Stok, Nota; Kasir: Kasir, Nota, Kas). Nota tampil sebagai tabel di ≥ 900px.
- **Tema "Slate & Emerald"**: dasar rekomendasi terverifikasi skill ui-ux-pro-max ("Inventory & Stock Management":
  industrial slate + stock green). Netral slate, emerald untuk merek/aksi, kuning & merah HANYA untuk status.
  Token di `:root`, mode gelap otomatis dengan langkah warnanya sendiri; semua pasangan teks/latar lulus WCAG ≥ 4.5:1.
  Warna seri grafik divalidasi (validator dataviz): terang `#047857`, gelap `#1fa87c`.
- **Font**: Plus Jakarta Sans (judul/angka) + Inter (teks) dari Google Fonts; jatuh ke font sistem bila gagal dimuat.
- **Grafik**: SVG dibuat lewat DOM (`sv()`, `grafikBatang`), satu seri, tooltip saat hover/fokus/ketuk, tabel data tersedia.
- **Cetak**: kelas `body.cetak-struk` / `body.cetak-laporan` memilih apa yang dicetak; `#gaya-kertas` mengatur @page.
  Per perangkat (localStorage `pos_cetak`): dialog cetak browser, atau **RawBT** — server menyertakan `nota.teks`/`rekap.teks`
  (baris 32/48 kolom, `strukTeks_`/`rekapTeks_`), klien membungkusnya ESC/POS (init + teks + potong) → `intent:base64,…` ke `_top`.
- **Scan barcode**: scanner USB/Bluetooth (ketik + Enter) atau kamera via `BarcodeDetector`; kamera langsung sering diblokir di
  iframe Apps Script → cadangan `<input type=file capture>` (foto) lalu dibaca `BarcodeDetector.detect()`. Semua lewat `masukkanKode()`.
- **Pintasan**: F2 / `/` cari produk, F9 bayar & proses, Enter di kolom uang = proses, Enter di layar sukses = transaksi baru, Esc tutup.

- SPA satu halaman; layar = `<section data-layar="kasir|item|form-item|nota|…">`, dipilih lewat `pindahLayar()`.
  **Tidak** memakai `location.hash`: Web App berjalan di iframe, tautan `#` berisiko memuat ulang halaman induk.
- `muatAwal(token)` sekali saat login: pengaturan publik + item aktif + kategori (hemat round-trip, ±1 dtk per panggilan).
  Setelah transaksi sukses, `muatAwal` dipanggil lagi di latar agar harga/stok selalu segar.
- Grid & pencarian item difilter di klien. Setelah transaksi sukses, stok item diperbarui dari respons.
- Keranjang disimpan di `sessionStorage` agar aman dari refresh tak sengaja.
- Tombol aksi dinonaktifkan selama request berjalan (cegah transaksi ganda karena tap dua kali).
- Viewport mobile wajib lewat `HtmlOutput.addMetaTag('viewport', ...)` (tag meta di HTML diabaikan HtmlService).
- Struk: `<div id="struk">` dirender lalu `window.print()`; lebar dari `LEBAR_STRUK` via variabel CSS.

## 7. Deploy & Pembaruan Banyak Toko

- Toko baru: copy Spreadsheet → POS > Setup Awal → Deploy > New deployment (Web app) → bagikan URL ke kasir.
- Update kode: tiap salinan punya `scriptId` sendiri; README menyediakan skrip loop `clasp push` + `clasp deploy -i <deploymentId>`
  per toko (daftar di `toko.local.json`, tidak di-commit). Setelah push, jalankan Setup Awal ulang = migrasi kolom baru.
- Gunakan **deployment ID yang sama** (`clasp deploy -i`) agar URL kasir tidak berubah.
