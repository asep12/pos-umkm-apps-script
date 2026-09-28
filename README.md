# POS UMKM — Google Apps Script

Aplikasi kasir (Point of Sales) untuk UMKM retail/sembako, F&B, atau campuran.
Database Google Sheets, backend Apps Script, tampilan Web App yang nyaman di HP/tablet.
**Satu Spreadsheet = satu toko.**

Versi: **1.6.0 (Beranda "Perlu tindakan", impor item, nilai persediaan, label barcode, tampilan HP & aksesibilitas dipoles)**. Rencana fase ada di [docs/PLAN.md](docs/PLAN.md).

---

## Lisensi & kredit

Dibuat oleh **asep94** — Threads [@asep94](https://www.threads.net/@asep94).
Dirilis dengan lisensi **MIT** (lihat [LICENSE](LICENSE)): bebas dipakai, diubah, dan dibagikan, **dengan tetap menyertakan
pemberitahuan hak cipta & nama pembuat**. Mohon tidak menghapus kredit di aplikasi dan dokumentasi.

## 1. Pasang di toko baru

### Cara A — salin dari Spreadsheet templat (disarankan)
Simpan satu Spreadsheet **"Templat POS"** yang tidak pernah dipakai berjualan (hanya berisi script).

1. Buka Templat POS → **File › Make a copy**. Beri nama, mis. "POS Toko Sumber Rezeki". Script ikut tersalin.
2. Buka salinan → muat ulang halaman → menu **POS › Setup Awal**.
   - Pertama kali akan muncul permintaan izin Google → **Allow**.
   - Dialog menampilkan **PIN Admin sementara**. **Catat**, hanya ditampilkan sekali.
3. Isi sheet **Pengaturan** (lihat §4).
4. (Opsional) **POS › Contoh Data**: ±55 item contoh (sembako, bumbu, makanan ringan, minuman, kebersihan, rumah tangga,
   bahan & menu kafe beserta resep). Barang punya barcode EAN-13 awalan `200` (aman, kode internal toko) untuk uji scanner.
   Boleh dijalankan ulang: hanya item yang namanya belum ada yang ditambahkan.
5. **Extensions › Apps Script › Deploy › New deployment** → ikon roda → **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   - **Deploy** → salin **URL Web App**.
6. Buka URL → login `admin` + PIN sementara → wajib ganti PIN.
7. Bagikan **URL Web App** ke kasir. **Jangan bagikan Spreadsheet** ke kasir (berisi hash PIN dan data bisnis).
8. Buat akun kasir: menu **Admin › + Pengguna**. PIN sementara muncul sekali; berikan ke kasir, yang wajib menggantinya saat login pertama.
   Kasir lupa PIN → **Admin ›** pilih pengguna › centang **Reset PIN**.

### Cara B — Spreadsheet kosong + clasp (untuk developer)
1. Buat Spreadsheet baru → **Extensions › Apps Script** → **Project Settings** → salin **Script ID**.
2. Di folder proyek: salin `.clasp.json.example` menjadi `.clasp.json`, lalu isi `scriptId`.
3. Jalankan `clasp login` (sekali saja), lalu `clasp push`.
4. Lanjutkan dari langkah 2 Cara A.

## 2. Update kode

**Satu toko:**
```bash
clasp push
```
Lalu di Apps Script: **Deploy › Manage deployments** → edit deployment Web App → *Version*: **New version** → **Deploy**.
URL tidak berubah. Setelah itu jalankan **POS › Setup Awal** sekali lagi. Tujuannya menambah kolom/pengaturan baru; data lama aman.

**Banyak toko sekaligus:**
1. Salin `toko.local.json.example` menjadi `toko.local.json`, lalu isi `nama`, `scriptId`, dan `deploymentId` tiap toko.
   `deploymentId` bisa dilihat di **Deploy › Manage deployments**. File ini tidak di-push dan jangan di-commit.
2. Jalankan:
   ```bash
   powershell -ExecutionPolicy Bypass -File scripts\update-semua-toko.ps1 -Keterangan "v1.0.1"
   ```
3. Jalankan **POS › Setup Awal** di tiap Spreadsheet toko bila versi baru menambah kolom.

## 3. Uji lokal (tanpa Google, untuk developer)

Butuh Node.js 18+. Emulator di `dev/` meniru Sheets/Cache/Lock/Properties. Emulator tidak ikut di-push.

```bash
node dev/uji-e2e.js
```
Menjalankan 52 skenario ujung-ke-ujung backend, termasuk seluruh kriteria Fase 1–4.

```bash
node dev/server.js
```
Web App lokal di http://localhost:8787, berisi data contoh + riwayat penjualan 13 hari (untuk mencoba Beranda & Laporan). Akun uji tercantum di `AKUN_UJI` dalam `dev/server.js`.
Data hanya ada di memori dan hilang saat server dihentikan.

Tes fungsi murni juga bisa dijalankan di Apps Script: **POS › Jalankan Tes Logika**, atau fungsi `jalankanTes` di editor.

## 4. Pengaturan

Ubah dari aplikasi: menu **Admin › Pengaturan toko** (langsung berlaku). Bisa juga langsung di sheet `Pengaturan`:

| Kunci | Contoh | Keterangan |
|---|---|---|
| NAMA_USAHA | Warung Bu Sri | Tampil di aplikasi & struk |
| ALAMAT / TELEPON | Jl. Melati 5 / 0812… | Struk |
| MODE_USAHA | Retail / F&B / Campuran | Retail menyembunyikan tipe Bahan/Menu & resep |
| PAJAK_PERSEN | 0 atau 10 | Pajak dari (subtotal − diskon) |
| FOOTER_STRUK | Terima kasih | Baris terakhir struk |
| LEBAR_STRUK | 58 atau 80 | Lebar kertas printer (mm) |
| PREFIX_NOTA | INV | Nota: `INV-260927-0001` |
| ZONA_WAKTU | Asia/Jakarta | WITA: Asia/Makassar, WIT: Asia/Jayapura |
| IZINKAN_STOK_MINUS | Tidak | `Ya` = tetap boleh jual walau stok habis |
| WAJIB_BUKA_KASIR | Tidak | `Ya` = kasir harus buka shift sebelum berjualan |
| VERSI | 1.0.0 | Diisi otomatis |

Perubahan yang diketik langsung di sheet terbaca aplikasi paling lambat **10 menit** kemudian (cache).
Agar langsung berlaku, jalankan **POS › Setup Awal** (atau ubah lewat menu Admin).

## 5. Mencetak struk

Tombol **Cetak struk** membuka dialog cetak browser. Di dialog cetak:
- *Paper size*: sesuaikan dengan kertas (58 mm / 80 mm) bila printer menyediakannya.
- *Margins*: **None**.
- *Headers and footers*: **matikan**.

Printer thermal Bluetooth (RawBT) direncanakan di Fase 4.

## 6. Checklist uji manual (di Google, setelah deploy)

### Fase 1

- [ ] **Setup Awal** di Spreadsheet kosong berhasil: 8 sheet dibuat, dialog menampilkan PIN admin.
- [ ] **Setup Awal** dijalankan ulang tidak menggandakan admin/pengaturan.
- [ ] Login `admin` → langsung diminta **ganti PIN** → setelah ganti, masuk layar Kasir.
- [ ] 5× PIN salah → pesan "terlalu banyak percobaan"; PIN benar pun ditolak sampai 10 menit.
- [ ] **POS › Contoh Data** → item tampil di Kasir (Bahan tidak tampil).
- [ ] Jual **1 Gula Pasir** → stok di sheet `Item` berkurang 1 → ada baris `Jual` di `Stok_Log` dengan nomor nota.
- [ ] Jual **1 Kopi Susu** → stok Kopi Bubuk −15 dan Susu Kental Manis −30, lalu cek `Stok_Log`.
- [ ] Jual **Telur Ayam** melebihi stok, atau ubah qty di keranjang → ditolak dengan pesan yang menyebut "Telur Ayam".
- [ ] Buka Web App di **2 HP/tab**, proses transaksi hampir bersamaan → nomor nota berbeda dan berurutan.
- [ ] **Cetak struk** 58 mm: nama toko, no nota, tanggal, kasir, item, total, bayar, kembalian, footer rapi dalam satu kolom.
- [ ] Tab **Nota** → cari nomor nota → cetak ulang.
- [ ] Menu **Item**: tambah item, ubah harga (cek `Harga_Log`), isi resep Menu (HPP otomatis), nonaktifkan item (hilang dari Kasir).
- [ ] Di **console browser** Web App, `google.script.run.setupAwal()` **gagal** (tidak boleh dipanggil dari web).
- [ ] Nama item `<b>tes</b>` tampil apa adanya sebagai teks (bukan huruf tebal).

### Checklist uji manual Fase 2

- [ ] **Admin › + Pengguna** buat kasir → PIN sementara tampil → login kasir → wajib ganti PIN.
- [ ] Login sebagai kasir: menu hanya **Kasir** dan **Nota**; tab Nota hanya berisi transaksi kasir itu hari ini, tanpa tombol batal.
- [ ] **Stok › Stok masuk**: tambah 10 Gula Pasir dengan harga beli baru → cek `Item`, `Stok_Log` (Masuk), `Harga_Log`.
- [ ] Stok masuk **Kopi Bubuk** dengan harga beli baru → HPP Kopi Hitam/Kopi Susu ikut berubah (lihat riwayat harga di form item).
- [ ] **Stok › Opname**: isi stok fisik beberapa item → selisih tampil → simpan → stok sama dengan fisik, ada log `Opname`.
- [ ] Buat stok di bawah minimum → badge merah di menu Stok; tab **Menipis** menampilkan item itu.
- [ ] **Stok › Riwayat**: filter item/jenis/tanggal.
- [ ] **Nota** (Admin): pilih nota → **Batalkan nota** dengan alasan → status Batal, stok kembali, struk bertanda DIBATALKAN.
- [ ] Void nota yang sama lagi → ditolak.
- [ ] **Admin › Pengaturan**: ubah prefix nota → transaksi berikutnya memakai prefix baru.
- [ ] Mode **Retail** → form item hanya menawarkan tipe Barang; resep tidak tampil.
- [ ] Coba nonaktifkan akun admin sendiri → ditolak.

### Checklist uji manual Fase 3

- [ ] Login Admin → mendarat di **Beranda**: KPI hari ini vs kemarin, grafik 7 hari, jam ramai, terlaris, stok menipis.
- [ ] Ketuk/arahkan batang grafik → tooltip tanggal, penjualan, jumlah transaksi.
- [ ] **Laporan** → coba preset Hari ini / 7 hari / Bulan ini; bandingkan total dengan sheet `Transaksi` (nota Batal tidak dihitung).
- [ ] **Ekspor ke Sheet** → sheet baru `Lap …` muncul di Spreadsheet; buka tautannya (perlu login akun pemilik).
- [ ] **Cetak / Simpan PDF** → pratinjau A4 berisi judul, periode, KPI, grafik, tabel (tanpa menu).
- [ ] Laptop: **F2** cari → ketik → **Enter** → **F9** → isi uang → **Enter** → **Enter** (transaksi baru).
- [ ] Ubah HP/laptop ke mode gelap → aplikasi ikut gelap; struk tetap hitam-putih.

### Checklist uji manual Kas & tutup kasir

> Setelah update kode, jalankan **POS › Setup Awal** sekali: sheet baru `Kas` dan `Shift` dibuat otomatis.

- [ ] Menu **Kas** → isi modal awal → **Buka kasir** → chip "Shift" muncul di atas.
- [ ] Jual tunai & QRIS, lalu **+ Catat kas** (mis. Operasional Rp 10.000) → "Seharusnya di laci" = modal + tunai + masuk − keluar.
- [ ] **Tutup kasir** → hitung per pecahan → selisih tampil (pas/kurang/lebih) → rekap bisa dicetak.
- [ ] Cek sheet `Shift` (status Tutup, selisih) dan `Kas`.
- [ ] Admin › Pengaturan → centang **Wajib buka kasir** → kasir tanpa shift tidak bisa bayar dan melihat banner "Buka kasir".
- [ ] Admin › Kas → riwayat shift & arus kas; buka shift kasir lain yang masih terbuka → **Tutup shift ini**.
- [ ] Laporan → KPI **Laba bersih** & **Biaya usaha**, kartu **Arus kas**.

### Checklist uji manual Fase 4

> Setelah update, jalankan **POS › Setup Awal** sekali: sheet baru `Bill` dibuat otomatis.

- [ ] **Printer (HP Android):** pasang **RawBT** dari Play Store, sambungkan printer Bluetooth di RawBT →
      di aplikasi: menu akun › **Printer struk** › RawBT › **Tes cetak** → struk keluar tanpa dialog. Lalu cetak struk transaksi.
- [ ] **Printer (laptop):** biarkan "Dialog cetak" → Cetak struk membuka dialog cetak seperti biasa.
- [ ] **Kamera (Chrome Android):** tombol barcode di sebelah kolom cari → arahkan ke barcode, atau "Ambil foto barcode" bila
      kamera langsung tidak diizinkan → item masuk keranjang. (Tombol tidak tampil di browser yang tidak mendukung.)
- [ ] **Bill:** isi keranjang → **Simpan bill** → pilih "Meja 2" → keranjang kosong, badge **Bill** = 1, stok belum berkurang.
- [ ] Buka **Bill** → **Buka & tambah/bayar** → tambah item → **Perbarui bill**; buka lagi → bayar → bill hilang dari daftar,
      sheet `Bill` berstatus Dibayar dengan No Nota, stok berkurang.
- [ ] Dua HP membuka bill yang sama, keduanya menyimpan → yang kedua mendapat pesan "diubah di perangkat lain".
- [ ] **Beranda › Perlu tindakan** → muncul stok menipis/habis, bill belum dibayar, dan kasir yang lupa ditutup dari hari sebelumnya; ketuk baris → langsung ke Stok › Menipis / Kas / daftar Bill.
- [ ] **Item › Alat › Impor dari Excel / CSV** → salin beberapa baris dari Excel (dengan judul kolom) → **Pratinjau** (baris galat ditandai) → **Impor** → item baru muncul dengan barcode.
- [ ] **Stok › Persediaan** → nilai modal di stok & per kategori.
- [ ] **Item › Alat › Cetak label** → pilih item, salinan 2 → **Cetak label** → pratinjau cetak berisi nama, harga, barcode (uji pindai dengan kamera).
- [ ] **Item › Alat › Ubah harga massal** → kategori Minuman, naik 10%, bulatkan Rp 500 → **Pratinjau** → **Simpan** → cek riwayat harga.

## 7. Pintasan keyboard (laptop/PC)

| Tombol | Fungsi |
|---|---|
| F2 atau / | Ke layar Kasir & fokus ke kolom cari (scanner barcode juga bisa langsung) |
| Enter (di kolom cari) | Masukkan item yang cocok ke keranjang |
| F9 | Buka pembayaran; di layar pembayaran: proses |
| Enter (di kolom uang) | Proses transaksi |
| Enter (layar sukses) | Transaksi baru |
| Esc | Tutup jendela / panel |

## 8. Struktur proyek

```
appsscript.json      manifest (V8, zona waktu, web app, izin minimal)
Code.js              doGet, menu, pembungkus API, kunci
Db.js                akses sheet & cache (satu-satunya yang menyentuh sheet)
Logika.js            fungsi murni (hitung transaksi, stok, HPP, nota)
Tes.js               tes fungsi murni
Setup.js             Setup Awal, migrasi kolom, Contoh Data
Auth.js              login PIN, sesi, ganti PIN
Pengaturan.js        pengaturan toko, kelola pengguna
Laporan.js           dashboard, laporan, terlaris, ekspor sheet
Kas.js               shift kasir, kas masuk/keluar, riwayat shift & arus kas
Bill.js              bill terbuka / meja
Contoh.js            katalog contoh (±55 item + resep)
Item.js, Resep.js    item, harga, resep, HPP
Transaksi.js         transaksi, nomor nota, nota, daftar transaksi, void
Stok.js              stok masuk, opname, riwayat stok, stok menipis
Index/Css/Js.html    frontend
docs/                arsitektur, database, API, keamanan, gaya kode, rencana
dev/                 emulator & tes lokal (tidak di-push)
scripts/             skrip update banyak toko
```
