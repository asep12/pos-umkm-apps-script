# PLAN.md

Status: **Fase 1–4 (pilihan) selesai dikode & lulus uji lokal (27-09-2026, versi 1.4.0). v1.3.1 sudah berjalan di Google; v1.4.0 menunggu push.**
Catatan terbuka: di Google sempat muncul "Gagal terhubung ke server"; pesan kini menampilkan detail asli untuk diagnosis.

## 1. Keputusan (celah/ambiguitas di spek)

| # | Topik | Masalah | Usulan (default) | Status |
|---|---|---|---|---|
| K1 | Pajak | `PAJAK_PERSEN` ada, tapi Transaksi tak punya kolom Pajak | Tambah kolom `Pajak`; `Total = Subtotal − Diskon + Pajak`; pajak dihitung dari (Subtotal − Diskon) | disetujui |
| K2 | Wajib ganti PIN | Spek minta paksa ganti PIN, tapi tak ada kolom penanda | Tambah kolom `Pengguna.Ganti PIN` | disetujui |
| K3 | PIN Admin default | Spek melarang hardcode data usaha | PIN acak 6 digit, tampil sekali di dialog Setup | disetujui |
| K4 | Hak Kasir | Spek hanya menyebut yang Admin-only | Kasir **hanya jual** (+ cetak ulang struk); semua urusan stok & item Admin | disetujui |
| K5 | `IZINKAN_STOK_MINUS` | Dipakai aturan 5.2 tapi tak ada di daftar kunci | Tambah kunci, default `Tidak` | otomatis |
| K6 | File tambahan | Spek tak punya tempat untuk fungsi murni & akses sheet | `Db.js`, `Logika.js`, `Tes.js`, `Pengaturan.js` | otomatis |
| K7 | Fungsi tambahan | Ganti PIN, kelola pengguna, ekspor, muat awal belum ada kontraknya | Lihat `API.md` (tanda `*`) | otomatis |
| K8 | Zona waktu | Manifest `Asia/Bangkok` | Ganti `Asia/Jakarta`; toko WITA/WIT ubah `ZONA_WAKTU` | otomatis |
| K9 | Nomor nota | Scan sheet Transaksi makin lambat | Counter harian di ScriptProperties, di dalam kunci | otomatis |
| K10 | Kode error | Spek hanya `{ok, pesan}` | Tambah `kode` agar frontend bisa bereaksi (sesi habis dll.) | otomatis |
| K11 | Void & resep berubah | Menghitung ulang resep saat void bisa salah bila resep sudah diubah | Kembalikan stok persis sesuai baris `Jual` di Stok_Log nota tsb | otomatis |
| K12 | Riwayat membesar | Membaca seluruh Stok_Log/Transaksi makin lambat | Baca mundur per blok (`telusuriMundur_`), berhenti saat lewat rentang tanggal | otomatis |
| K13 | Akun pengguna | PIN baru/reset harus diketahui pengguna | Server membuat PIN sementara acak, ditampilkan sekali ke Admin, wajib ganti | otomatis |
| K14 | `MODE_USAHA` | Spek: "menyembunyikan fitur" | Hanya di UI: Retail menyembunyikan tipe Bahan/Menu & resep; data lama tetap berfungsi | otomatis |
| K15 | Edit harga massal | Layar Harga "opsional" di spek, tidak disebut di Fase 2 | Belum dibuat; harga diubah per item + riwayat harga | ditunda |
| K16 | Ekspor PDF | PDF dari server butuh izin Drive/UrlFetch tambahan | PDF dari browser (Cetak › Simpan sebagai PDF, tata letak A4 khusus); ekspor Sheet dari server | otomatis |
| K17 | Laba kotor | Pajak & diskon | Laba kotor = (subtotal − diskon) − HPP salinan transaksi; pajak tidak dihitung sebagai pendapatan; nota Batal dikecualikan | otomatis |
| K18 | Halaman awal | — | Admin mendarat di Beranda (dashboard), Kasir di layar Kasir | otomatis |
| K19 | Fitur dari referensi KasirPro | Di luar spek | Dipilih: Kas & tutup kasir (berikutnya). Tidak dipilih: struk WhatsApp, pelanggan & kasbon, diskon per item & retur | disetujui |
| K20 | Tema | — | Terang + gelap otomatis mengikuti perangkat | disetujui |
| K21 | Palet | Diminta lebih baik, berbasis ui-ux-pro-max | Skill dipasang (proyek) & diperiksa aman; DB tak punya profil POS → dipakai profil terverifikasi "Inventory & Stock Management" (slate + emerald). Rekomendasi pertama (aksen merah = warna bahaya) ditolak | otomatis |
| K22 | Hak Kasir di Kas | K4 "hanya jual" | Kasir boleh buka/tutup shift sendiri & catat kas selama shift (laci adalah tanggung jawab kasir); sisanya Admin | otomatis |
| K23 | Penjualan per shift | Tambah kolom Shift di Transaksi? | Tidak: dihitung dari Transaksi per kasir & rentang waktu shift | otomatis |
| K24 | Laba bersih | Kas keluar mana yang biaya? | Operasional/Gaji/Lainnya = biaya; Belanja stok (sudah HPP) & Setoran tidak; Pendapatan lain menambah | otomatis |
| K25 | Wajib buka kasir | Memaksa shift bisa mengganggu toko lama | Pengaturan `WAJIB_BUKA_KASIR`, default Tidak | otomatis |
| K26 | Cakupan Fase 4 | 6 fitur opsional di spek | Dipilih: printer RawBT + kamera, bill terbuka/meja, edit harga massal. Tidak: varian/konversi, offline/arsip, kasbon | disetujui |
| K27 | Printer | Setelan global atau per perangkat? | Per perangkat (localStorage): laptop = dialog cetak, HP Android = RawBT | otomatis |
| K28 | Kamera di iframe Apps Script | getUserMedia sering diblokir kebijakan iframe | Coba langsung; cadangan ambil foto + BarcodeDetector. Tombol hanya tampil bila browser mendukung (Chrome Android) | otomatis |
| K29 | Harga di bill | Kunci harga saat pesan atau saat bayar? | Saat bayar (server menghitung ulang); daftar bill menampilkan estimasi harga terbaru | otomatis |

## 2. Fase 1 — MVP (urutan kerja)

1. **Fondasi**: `appsscript.json` (V8, Asia/Jakarta, webapp, oauthScopes), `.claspignore`, `.clasp.json.example`.
2. **Code.js**: `doGet` (template + meta viewport + judul dari Pengaturan), `include`, `onOpen`, `jalankan_`, `galat_`, `denganKunci_`, `pastikanDariSpreadsheet_`.
3. **Db.js**: `SKEMA`, `bacaTabel_`, `keObjek_`, `tambahBaris_`, `tulisKolom_`, `amanSel_`, cache berversi (`cacheAmbil_`, `cacheSimpan_`, `naikkanVersi_`), `bacaPengaturan_`.
4. **Logika.js + Tes.js**: `bulatUang_`, `bulatQty_`, `hitungDiskon_`, `hitungTransaksi_`, `hitungKebutuhanStok_`, `cekStok_`, `hitungHppMenu_`, `formatNomorNota_`, `margin_` + `jalankanTes`.
5. **Setup.js**: `setupAwal` (sheet, header, freeze, validasi dropdown, Pengaturan default, admin default, VERSI, dialog ringkasan), `contohData` (Barang, Bahan, Menu + resep).
6. **Auth.js**: `login`, `logout`, `infoSesi`, `gantiPin`, `hashPin_`, `simpanSesi_`, `cekSesi_`, `buatPinAcak_`.
7. **Item.js + Resep.js**: `muatAwal`, `listItem`, `simpanItem` (+Harga_Log), `setAktifItem`, `getResep`, `simpanResep` (+hitung ulang HPP).
8. **Transaksi.js**: `buatTransaksi`, `getNota`, `nomorNota_`.
9. **Frontend**: login & ganti PIN → Kasir (grid, cari, filter, keranjang, diskon, bayar, nominal cepat, kembalian) → Daftar & Form Item (+resep untuk Menu) → Struk cetak.
10. **README.md**: pasang toko baru, update via clasp, checklist uji manual Fase 1.

### Kriteria selesai Fase 1
Terverifikasi otomatis di emulator (`node dev/uji-e2e.js`, 25 skenario) dan di UI lokal (`node dev/server.js`).
Uji di Google tetap wajib: lihat checklist README §6.
- [x] Setup Awal sukses di Spreadsheet kosong; dijalankan ulang tidak menggandakan apa pun.
- [x] Login admin → dipaksa ganti PIN → masuk.
- [x] 5× PIN salah → terkunci 10 menit.
- [x] Jual 1 Barang → stok berkurang, baris `Stok_Log` jenis `Jual`.
- [x] Jual 1 Menu ber-resep → stok tiap bahan berkurang `Qty resep × qty`.
- [x] Jual melebihi stok → ditolak, pesan menyebut nama item/bahan.
- [x] Dua transaksi beruntun → nomor nota berbeda & berurutan.
- [x] Struk dirender untuk 58/80 mm (cetak fisik: uji di README §6).
- [x] Memanggil `setupAwal` dari Web App → ditolak.
- [x] `jalankanTes` semua ✔ (18 kasus).

## 3. Fase 2 — Stok & Role (selesai)

- **Backend**: `Stok.js` (`stokMasuk`, `opname`, `listStokLog`, `listStokMenipis`), `riwayatHarga`, `listTransaksi`, `voidTransaksi`,
  `simpanPengaturan`, `listPengguna`, `simpanPengguna`; helper `telusuriMundur_`, `terapkanHppMenu_`.
- **Frontend**: menu Stok (4 tab + badge menipis), Nota (daftar transaksi, ringkasan, detail, void), Admin (pengaturan + pengguna + PIN sementara),
  riwayat harga di form item, `MODE_USAHA` Retail.

### Kriteria selesai Fase 2
Terverifikasi di emulator (`node dev/uji-e2e.js`, total 36 skenario; 11 khusus Fase 2) dan di UI lokal (desktop & 375px).
- [x] Stok masuk menambah stok + log `Masuk`; harga beli baru tercatat di Harga_Log dan HPP menu ikut diperbarui.
- [x] Opname: stok = fisik, selisih tercatat `Opname`; selisih 0 tidak dicatat.
- [x] Stok menipis tampil di tab Menipis + badge navigasi (Admin).
- [x] Riwayat stok & riwayat harga dengan filter.
- [x] Kasir tidak bisa stok masuk/opname/void/pengaturan/pengguna (`AKSES_DITOLAK`); hanya melihat transaksinya hari ini.
- [x] Void (Admin, alasan wajib): status Batal, stok kembali persis walau resep sudah berubah, baris asli tetap ada, tidak bisa void dua kali.
- [x] Kelola pengguna: buat kasir, reset PIN (PIN lama tidak berlaku), tidak bisa menonaktifkan diri sendiri, minimal 1 Admin aktif.
- [x] Pengaturan dari web langsung berlaku (prefix nota, nama toko, mode).
- [x] `MODE_USAHA = Retail` menyembunyikan tipe Bahan/Menu & resep.

## 4. Fase 3 — Laporan + upgrade UI (selesai)

- **Backend**: `Laporan.js` (`dashboard`, `laporanRingkas`, `laporanTerlaris`, `eksporLaporan`); agregasi murni `ringkasPenjualan_`,
  `geserHari_`, `daftarHari_`, `rentangLaporan_` (+ 3 kasus tes).
- **Frontend**: Beranda (KPI vs kemarin, grafik 7 hari, jam ramai, metode bayar, terlaris, stok menipis, transaksi terakhir),
  Laporan (preset rentang, KPI, grafik & tabel harian, terlaris, per metode, per kasir, ekspor Sheet, cetak/PDF A4),
  sidebar desktop, tipografi baru, mode gelap otomatis, pintasan keyboard, penyegaran stok otomatis di layar Kasir.

### Kriteria selesai Fase 3
Terverifikasi di emulator (`node dev/uji-e2e.js`, total 42 skenario; 6 khusus Fase 3) dan di UI lokal (desktop 1366px, HP 375px, terang & gelap).
- [x] Angka laporan = hitungan manual langsung dari sheet (penjualan, laba kotor, batal, per metode/kasir/jam).
- [x] Data multi-hari: rentang terpotong tepat; detail nota yang terbelah di batas blok baca tetap lengkap.
- [x] Dashboard: hari ini vs kemarin, 7 hari, stok menipis, transaksi terakhir.
- [x] Ekspor ke sheet baru (nama unik, tanggal tetap teks); cetak laporan A4.
- [x] Semua laporan khusus Admin.

## 5. Fase 4a — Kas & tutup kasir (selesai)

- **Backend**: `Kas.js`; sheet baru `Kas` & `Shift` (dibuat Setup Awal); `rekapShift_`, `hitungPecahan_`, `normalisasiKas_`, `ringkasKas_`;
  laporan + laba bersih & arus kas; `WAJIB_BUKA_KASIR`; cari nota berdasarkan nama kasir.
- **Frontend**: layar Kas (buka kasir, KPI laci, catat kas, tutup kasir hitung pecahan + selisih, rekap/struk), riwayat shift & arus kas (Admin),
  chip shift di topbar, banner wajib buka kasir, sidebar berkelompok + Keluar, tabel nota desktop, palet Slate & Emerald,
  temuan checklist ui-ux-pro-max (ikon SVG, aria-current, autocomplete password manager).

### Kriteria selesai Fase 4a
Terverifikasi di emulator (`node dev/uji-e2e.js`, total 48 skenario; 6 khusus Kas) dan UI lokal (desktop/HP, terang/gelap, Admin & Kasir).
- [x] Kasir tanpa shift tidak bisa catat kas; Admin bisa catat kas toko.
- [x] Rekap berjalan: seharusnya = modal + tunai + masuk − keluar; nota batal & non-tunai tidak masuk laci.
- [x] Tutup dengan hitung pecahan → selisih tersimpan; void setelah tutup tidak mengubah rekap.
- [x] Wajib buka kasir: jual ditolak tanpa shift; Admin bisa menutup shift kasir lain.
- [x] Laba bersih & arus kas di laporan dan ekspor sheet.

## 5b. Poles UX (selesai, v1.3.1)
- Contoh Data ±55 item + resep, barcode EAN-13 (`ean13_` + tes), idempoten per nama.
- Skeleton loading; toast dengan "Urungkan" (hapus item & kosongkan keranjang tanpa dialog konfirmasi).
- Modal: fokus awal (`data-fokus-awal`), Tab terkurung, fokus kembali ke asal (F9 dari kolom cari → kembali ke kolom cari).
- Kartu "Mulai cepat" di Beranda untuk toko baru (`dashboard().penyiapan`).
- Perbaikan (laporan pengguna: flicker & spinner terlalu cepat): kelas skeleton bentrok dengan `.kerangka` (kerangka aplikasi)
  sehingga seluruh halaman berkilau & tingginya terkunci (sidebar tidak menempel); aturan reduced-motion kini mematikan animasi
  (bukan durasi 0,01 ms berulang); spinner 1,1 dtk (2,4 dtk saat reduced-motion); font `display=optional`; grafik digambar ulang
  hanya bila lebar berubah; menu dibangun ulang hanya bila peran berubah.

## 5c. Fase 4 — printer, kamera, bill, harga massal (selesai, v1.4.0)
- **Backend**: `Bill.js` + sheet `Bill`; `buatTransaksi` menutup bill dalam kunci yang sama; `ubahHargaMassal` (pratinjau/simpan);
  `strukTeks_`, `rekapTeks_`, `kolomStruk_`, `normalisasiHargaMassal_`, `hitungHargaMassal_`, `normalisasiBill_` (+ tes).
- **Frontend**: menu Printer struk (dialog/RawBT + tes cetak), tombol kamera, tombol Bill (badge) + simpan/perbarui/lepas bill,
  modal Ubah harga massal dengan pratinjau wajib.

### Kriteria selesai
Terverifikasi di emulator (`node dev/uji-e2e.js`, total 52 skenario) dan UI lokal. RawBT & kamera diuji dengan tiruan
(format intent/ESC-POS dan jalur cadangan foto); **uji fisik di HP Android + printer Bluetooth tetap diperlukan**.
- [x] Nota & rekap membawa teks struk ≤ lebar kolom; cetak ulang = struk asli.
- [x] Harga massal: pratinjau tidak menyimpan; simpan tercatat di Harga_Log; Bahan/nonaktif tak tersentuh; khusus Admin.
- [x] Bill: tidak memotong stok, bisa diubah, konflik versi terdeteksi, bayar menutup bill & memotong stok, bisa dibatalkan.

## 6. Fase Berikutnya (ringkas)
- **Fase 4** (opsional): scanner kamera, RawBT, varian/topping, satuan konversi, bill terbuka, offline ringan, arsip tahunan.
