# DATABASE.md

## 1. Stack
- Google Sheets, Spreadsheet aktif (`SpreadsheetApp.getActive()`), **tanpa** ID yang ditulis di kode.
- Satu sheet = satu tabel. Baris 1 = header (tebal, dibekukan). Kode memetakan kolom **berdasarkan nama header**.
- Definisi sheet & header ada di satu tempat: konstanta `SKEMA` di `Db.js` (dipakai Setup dan seluruh akses data).

## 2. Tipe Nilai
| Jenis | Disimpan sebagai | Aturan |
|---|---|---|
| Uang | Number bulat Rupiah | `bulatUang_()` = `Math.round`; format hanya di tampilan |
| Qty/Stok | Number, boleh desimal | `bulatQty_()` = bulat 3 desimal (hindari 0.30000000004) |
| Tanggal | `Date` | Zona waktu dari `ZONA_WAKTU` → fallback `Session.getScriptTimeZone()` |
| Ya/Tidak | Teks `Ya` / `Tidak` | Dengan validasi dropdown |
| Teks pengguna | Teks | Melalui `amanSel_()`: awalan `= + - @` diberi `'` (cegah formula injection) |

## 3. Tabel

**Item** (mutable) — `ID, Kode, Nama, Tipe, Kategori, Satuan, Harga Beli, Harga Jual, Stok, Stok Min, Lacak Stok, Aktif, Foto`
- `ID` `ITM-0001` = maks+1, dibuat di dalam kunci. `Kode` unik bila diisi. Item tidak pernah dihapus, hanya `Aktif = Tidak`.
- `Harga Beli` untuk `Menu` = HPP otomatis dari resep (bila ada resep).

**Resep** (mutable, ganti-semua per menu) — `ID Menu, ID Bahan, Qty`
- `ID Menu` → Item bertipe Menu. `ID Bahan` → Item bertipe Bahan/Barang. Satu bahan maksimal satu baris per menu.

**Transaksi** (append-only, hanya `Status` yang boleh berubah) —
`No Nota, Tanggal, Kasir, Subtotal, Diskon, Pajak*, Total, Metode, Status, Referensi, Bayar, Kembalian, Catatan`
- `Total = Subtotal − Diskon + Pajak`. `Kasir` = username dari sesi server.
- Void: `Status` → `Batal`, alasan ditambahkan ke `Catatan` (`BATAL oleh <user>: <alasan>`). Baris tidak dihapus.

**Detail** (append-only) — `No Nota, ID Item, Nama, Qty, Harga, Subtotal, HPP Satuan`
- `Nama`, `Harga`, `HPP Satuan` adalah **salinan** saat transaksi (laporan tetap benar walau item berubah).

**Stok_Log** (append-only) — `Tanggal, ID Item, Nama, Jenis, Qty, Stok Sesudah, Ref, Kasir/User, Keterangan`
- `Jenis`: `Masuk/Keluar/Opname/Jual/Void/Koreksi`. `Qty` bertanda (+ tambah, − kurang).
- `Ref`: no. nota (Jual/Void) atau no. faktur supplier (Masuk). Opname: `Keterangan` memuat stok sistem sebelum opname.

**Harga_Log** (append-only) — `Tanggal, ID Item, Harga Beli Lama, Harga Beli Baru, Harga Jual Lama, Harga Jual Baru, User`

**Pengguna** (mutable) — `Username, Nama, PIN Hash, Salt, Role, Aktif, Ganti PIN*`
- `Username` unik, huruf kecil. `Ganti PIN = Ya` memaksa ganti PIN saat login berikutnya.

**Pengaturan** (mutable, `Kunci | Nilai`) — kunci spek + `IZINKAN_STOK_MINUS*` (default `Tidak`) + `WAJIB_BUKA_KASIR*` (default `Tidak`).

**Kas*** (append-only) — `ID, Tanggal, Jenis, Kategori, Jumlah, Keterangan, User, Shift`
- `ID` `KAS-YYMMDD-NNNN`. `Jenis` Masuk/Keluar. `Jumlah` selalu positif. `Shift` kosong = kas toko (dicatat Admin tanpa shift).
- Kategori Keluar: Operasional, Belanja stok, Gaji, Setoran ke pemilik, Lainnya. Masuk: Tambahan modal, Pendapatan lain, Lainnya.
- Biaya usaha (mengurangi laba bersih) = Keluar kategori Operasional/Gaji/Lainnya. Belanja stok (sudah di HPP) & setoran tidak.

**Bill*** (mutable selama Terbuka) — `ID, Nama, Items, Catatan, Status, Dibuat, Diperbarui, Kasir, No Nota`
- `ID` `BILL-YYMMDD-NNNN`. `Items` = JSON `[{idItem, qty}]` (disimpan sebagai teks). `Status` Terbuka/Dibayar/Batal.
- Bill = keranjang tersimpan: stok dipotong & harga dihitung saat dibayar. Versi = `Diperbarui` (resolusi detik) untuk deteksi konflik.

**Shift*** (mutable: baris diperbarui sekali saat tutup) — `ID, Kasir, Buka, Modal Awal, Tutup, Jumlah Transaksi, Penjualan Tunai,
Penjualan Non Tunai, Kas Masuk, Kas Keluar, Kas Seharusnya, Kas Fisik, Selisih, Status, Catatan`
- `ID` `SFT-YYMMDD-NNNN`; maksimal satu `Status = Buka` per kasir.
- Penjualan shift dihitung dari `Transaksi` (Kasir = pemilik shift, Tanggal di antara Buka–Tutup): Transaksi tidak perlu kolom baru.
- Angka saat tutup disimpan sebagai snapshot (void sesudahnya tidak mengubah rekap). `Kas Seharusnya = Modal + Tunai + Masuk − Keluar`.

`*` = tambahan terhadap spek, **disetujui** (lihat `PLAN.md` §1).

## 4. Relasi
```
Item 1 ─── n Resep (sebagai menu)      Transaksi 1 ─── n Detail (No Nota)     Shift 1 ─── n Kas (Shift = ID)
Item 1 ─── n Resep (sebagai bahan)     Item 1 ─── n Detail / Stok_Log / Harga_Log (ID Item)
Pengguna.Username ─── Transaksi.Kasir, Stok_Log.Kasir/User, Harga_Log.User
```
Sheets tidak punya foreign key: integritas dijaga di server (validasi ID & tipe saat simpan).

## 5. Aturan Tulis
- Baca sekali (`getDataRange().getValues()`), olah di memori, tulis dengan `setValues` blok.
- Tambah baris: `tambahBaris_(sheet, rows)` → satu `setValues` di `lastRow+1` (bukan `appendRow` dalam loop).
- Update stok: tulis ulang **seluruh kolom Stok** dengan satu `setValues` (di dalam kunci).
- Update satu sel (mis. Status void) boleh `getRange().setValue()` sekali, bukan dalam loop.
- Tidak pernah menghapus baris di sheet append-only. Pembatalan = baris log baru.

## 6. Migrasi
- Setup Awal **idempotent**: membuat sheet yang belum ada, menambah header yang hilang **di ujung kanan**, menambah kunci Pengaturan yang belum ada, menulis `VERSI`.
- Karena pemetaan berbasis nama header, menambah kolom tidak merusak data lama. **Jangan** mengganti nama/menghapus kolom tanpa langkah migrasi tertulis.
- Update ke banyak toko: `clasp push` lalu jalankan Setup Awal di tiap toko.

## 7. Kapasitas & Keamanan Data
- Batas Spreadsheet 10 juta sel. Perkiraan: 100 transaksi/hari × 3 item → Detail ±110 rb baris/tahun (±770 rb sel) — aman beberapa tahun.
- `Stok_Log` tumbuh paling cepat; `listStokLog` membaca dari bawah dengan batas. Arsip per tahun direncanakan di Fase 4.
- Edit manual kolom `Stok` di sheet melewati log → gunakan Opname di aplikasi.
- Spreadsheet **tidak dibagikan** ke kasir (lihat `SECURITY.md`). Backup: File > Version history / salin berkala.
