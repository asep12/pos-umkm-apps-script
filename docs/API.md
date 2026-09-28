# API.md

## 1. Mekanisme
- Tidak ada REST. Frontend memanggil fungsi server lewat `google.script.run`, dibungkus `api(nama, ...args)` → Promise.
- **Setiap fungsi top-level tanpa akhiran `_` otomatis bisa dipanggil siapa pun yang punya URL.** Daftar di bawah adalah
  satu-satunya fungsi publik yang boleh ada (+ `doGet`, `onOpen`, `include` (hanya Css/Js), `setupAwal`, `contohData`, `jalankanTes`).

## 2. Bentuk Respons
```js
{ ok: true,  data: <any> }
{ ok: false, kode: 'VALIDASI', pesan: 'Qty harus lebih dari 0' }
```
| kode | Arti | Reaksi frontend |
|---|---|---|
| `SESI_HABIS` | token tidak valid/kedaluwarsa | ke layar login |
| `WAJIB_GANTI_PIN` | harus ganti PIN dulu | ke form ganti PIN |
| `AKSES_DITOLAK` | role tidak cukup | toast |
| `VALIDASI` | input salah | toast / tandai field |
| `STOK_KURANG` | stok tidak cukup (pesan menyebut item) | toast, keranjang tetap |
| `TIDAK_ADA` | data tidak ditemukan | toast |
| `TERKUNCI` | terlalu banyak login gagal | toast |
| `SIBUK` | gagal mendapat kunci 10 dtk | toast "coba lagi" |
| `SHIFT_TUTUP` | wajib buka kasir, tapi shift belum dibuka | pesan + banner "Buka kasir" |
| `KONFLIK` | bill diubah/dibayar/dibatalkan di perangkat lain (versi usang) | pesan + muat ulang daftar bill |
| `SERVER` | error tak terduga (detail tidak dikirim) | toast umum |

`kode` adalah **tambahan** dari spek (spek hanya `{ok, pesan}`); tetap kompatibel.

## 3. Aturan Data Lintas Klien–Server
- Tidak boleh ada `Date` di nilai kembalian (google.script.run mengubah hasil menjadi `null`). Kirim `'2026-09-27 14:05'` / ISO string.
- Tanggal masuk dari klien: `'YYYY-MM-DD'`, diparse di server sesuai zona waktu toko.
- Angka dari klien divalidasi `Number.isFinite`; **harga & HPP tidak pernah diterima dari klien.**

## 4. Daftar Fungsi
Role: `P` = publik (tanpa token), `K` = Kasir & Admin, `A` = Admin saja. Fase = kapan dibuat.

| Fungsi | Role | Fase | Input → Output (`data`) |
|---|---|---|---|
| `login(username, pin)` | P | 1 | → `{token, nama, role, wajibGantiPin}` |
| `logout(token)` | K | 1 | → `true` |
| `infoSesi(token)` | K | 1 | → `{username, nama, role, wajibGantiPin}` |
| `gantiPin(token, pinLama, pinBaru)` * | K | 1 | → `true` (satu-satunya fungsi yang lolos saat wajib ganti PIN) |
| `muatAwal(token)` * | K | 1 | → `{toko, sesi, items, kategori, jumlahMenipis, shiftAktif}`; items = aktif & bukan Bahan; `jumlahMenipis` 0 untuk Kasir; `shiftAktif` = `{id, buka}` atau null |
| `getPengaturan(token)` | K | 1 | → `{nama, alamat, telepon, footer, lebarStruk, mode, pajakPersen, prefixNota, izinkanStokMinus, zonaWaktu, versi}` |
| `simpanPengaturan(token, obj)` | A | 2 | bentuk sama dengan `getPengaturan` (tanpa `versi`) → pengaturan baru; langsung berlaku (cache di-invalidasi) |
| `listPengguna(token)` * | A | 2 | → `[{username, nama, role, aktif, gantiPin}]` (tanpa hash/salt) |
| `simpanPengguna(token, user)` * | A | 2 | `{baru, username, nama, role, aktif, resetPin}` → `{pengguna, pinSementara}`; `pinSementara` hanya ada untuk pengguna baru/reset PIN. Tidak bisa menonaktifkan/menurunkan diri sendiri; minimal 1 Admin aktif |
| `listItem(token, filter)` | K | 1 | `{q, tipe, kategori, aktif}` → `[item]` + `menipis`; Admin juga `hargaBeli`, `margin` (Kasir: hanya item aktif, tanpa harga beli) |
| `simpanItem(token, item)` | A | 1 | tanpa `ID` = baru → item tersimpan; catat Harga_Log bila harga berubah |
| `setAktifItem(token, id, aktif)` | A | 1 | → item |
| `ubahHargaMassal(token, {kategori, tipe, mode, nilai, bulat, pratinjau})` * | A | 4 | `mode` persen (−90..500) / nominal; `bulat` 0/100/500/1000 (ke atas); `pratinjau` = tidak menyimpan → `{perubahan:[{id, nama, kategori, lama, baru}], disimpan}`; tercatat di Harga_Log |
| `imporItem(token, {teks, mode, buatBarcode, pratinjau})` * | A | 5 | `teks` = tabel tempel Excel/CSV (tab/`;`/`,`; baris 1 judul, maks 1000 baris; kolom dikenali lewat sinonim, **Nama** wajib). `mode` `tambah` (nama sudah ada dilewati) / `perbarui` (hanya kolom yang ada di tabel yang ditimpa). → `{disimpan, kolom, baru, diperbarui, dilewati, galat, laporan:[{baris, nama, aksi, pesan}]}`; perubahan harga ke Harga_Log, stok awal ke Stok_Log |
| `ringkasPersediaan(token)` * | A | 5 | → `{nilai, jumlahItem, perKategori:[{kategori, nilai, jumlah}]}` = Σ stok × harga beli (item aktif, dilacak, bukan Menu, stok > 0) |
| `labelItem(token, {ids, buatKode})` * | A | 5 | maks 300 ID → `[{id, nama, harga, satuan, kode, bits}]`; `bits` = 95 modul EAN-13 ("1"=batang) untuk digambar SVG; `buatKode` mengisi kolom Kode yang kosong dengan EAN-13 awalan 200 (di dalam kunci) |
| `riwayatHarga(token, id)` | A | 2 | → `[{tanggal, hargaBeliLama, hargaBeliBaru, hargaJualLama, hargaJualBaru, user}]` terbaru dulu, maks 100 |
| `getResep(token, idMenu)` | A | 1 | → `{baris:[{idBahan, nama, satuan, qty, hargaBeli}], hpp}` |
| `simpanResep(token, idMenu, baris[])` | A | 1 | `[{idBahan, qty}]` → resep + HPP baru |
| `stokMasuk(token, {idItem, qty, hargaBeli?, ref?, ket?})` | A | 2 | → `{idItem, nama, stok, hargaBeli, hppMenuBerubah}`; `hargaBeli` kosong = harga tetap; Menu ditolak |
| `opname(token, [{idItem, stokFisik}], ket)` | A | 2 | → `[{idItem, nama, satuan, stokLama, stokFisik, selisih}]`; selisih 0 tidak dicatat |
| `listStokLog(token, filter)` | A | 2 | `{idItem?, jenis?, dari?, sampai?, limit≤500}` → `{baris:[{tanggal, idItem, nama, jenis, qty, stokSesudah, ref, user, ket}], penuh, rentang}`; default hari ini |
| `listStokMenipis(token)` | A | 2 | → `[item]` aktif, dilacak, bukan Menu, `stok ≤ stokMin`; paling kritis dulu |
| `buatTransaksi(token, trx)` | K | 1 | lihat §5 → nota lengkap. Opsional `idBill` + `versiBill`: bill ditutup (Dibayar + No Nota) dalam kunci yang sama |
| `getNota(token, noNota)` | K | 1 | → nota lengkap (cetak ulang) |
| `listTransaksi(token, filter)` | K | 2 | `{q?, dari?, sampai?, kasir?, status?}` → `{baris:[{noNota, tanggal, kasir, total, metode, status}], ringkas:{jumlah, total, batal}, penuh, rentang}`. Kasir: filter diabaikan, selalu miliknya hari ini |
| `voidTransaksi(token, noNota, alasan)` | A | 2 | alasan wajib → nota berstatus Batal; stok dikembalikan sesuai baris `Jual` di Stok_Log nota itu |
| `laporanRingkas(token, {dari, sampai})` | A | 3 | maks 366 hari → `{kas:{biaya, pendapatanLain, perKategori[]}, labaBersih, jumlah, omzet, penjualanBersih, diskon, pajak, hpp, labaKotor, margin, rataRata, batal:{jumlah,total}, perHari[], perMetode[], perKasir[{kasir,nama,jumlah,total}], perJam[24], terlaris[≤10], rentang}` |
| `dashboard(token)` * | A | 3 | → `{tanggal, hariIni, kemarin, perMetodeHariIni, tujuhHari[7], perJam[24], terlaris[≤5], menipis:{jumlah,daftar[≤5]}, terakhir[≤5], penyiapan, perhatian[]}`. `perhatian` = `[{jenis, tingkat:'bahaya'\|'peringatan'\|'info', judul, ket, tujuan:'stok'\|'kas'\|'bill'}]` urut paling mendesak (stok habis, shift yang dibuka sebelum hari ini, stok menipis, bill terbuka); shift hari ini tidak dimunculkan |
| `laporanTerlaris(token, {dari, sampai, limit})` | A | 3 | limit ≤ 100 → `[{idItem, nama, qty, omzet, laba}]` urut qty |
| `infoShift(token)` * | K | 4 | → `{wajibBukaKasir, kategori:{Masuk[],Keluar[]}, pecahan[], shift}`; `shift` = rekap berjalan milik sendiri (+ `kas[]`) atau null |
| `bukaShift(token, {modalAwal, catatan})` * | K | 4 | satu shift terbuka per pengguna → rekap shift |
| `catatKas(token, {jenis, kategori, jumlah, keterangan})` * | K | 4 | Kasir wajib punya shift terbuka (`SHIFT_TUTUP`); Admin boleh tanpa shift (kas toko). Kategori "Lainnya" wajib keterangan → entri kas |
| `tutupShift(token, {kasFisik}` atau `{pecahan}`, `catatan, idShift?)` * | K | 4 | `idShift` hanya Admin (menutup shift kasir lain) → rekap + `kasFisik`, `selisih`; angka disimpan sebagai snapshot |
| `getShift(token, id)` * | K | 4 | Kasir hanya shift sendiri → rekap (berjalan bila masih terbuka) |
| `listShift(token, {dari, sampai})` * | A | 4 | → `{baris[], rentang}`; shift terbuka selalu ikut tampil |
| `listKas(token, {dari, sampai, jenis?})` * | A | 4 | → `{baris[≤300], ringkas:{masuk, keluar, biaya, pendapatanLain, perKategori[]}, penuh, rentang}` |
| `listBill(token)` * | K | 4 | → bill terbuka `[{id, nama, catatan, items[{idItem, qty, nama, harga, satuan}], jumlahItem, estimasi, dibuat, diperbarui, versi, kasir}]` (harga terbaru, sebelum diskon/pajak) |
| `simpanBill(token, {id?, versi?, nama, items, catatan})` * | K | 4 | tanpa `id` = bill baru; dengan `id` wajib `versi` terbaru (`KONFLIK` bila usang). Stok TIDAK dipotong → bill |
| `batalBill(token, id, versi)` * | K | 4 | status Batal (baris tidak dihapus) → `true` |
| `eksporLaporan(token, {dari, sampai})` * | A | 3 | membuat sheet baru `Lap <dari> sd <sampai>` di Spreadsheet toko → `{nama, url}`. PDF dibuat dari browser (Cetak › Simpan sebagai PDF) |

`*` = tambahan dari spek, dibutuhkan untuk fitur yang sudah disebut spek (ganti PIN, kelola pengguna, ekspor, muat awal).

## 5. `buatTransaksi`
Request:
```js
{ items: [{ idItem: 'ITM-0001', qty: 2 }],
  diskon: { jenis: 'nominal' | 'persen', nilai: 5000 },
  metode: 'Tunai' | 'QRIS' | 'Transfer',
  bayar: 50000, referensi: '', catatan: '' }
```
Validasi server: items tidak kosong, idItem ada & aktif & bukan Bahan, qty > 0 (maks 3 desimal), item duplikat digabung,
diskon 0..subtotal (persen 0..100), Tunai: bayar ≥ total; non-Tunai: bayar = total.

Respons `data` (juga dipakai `getNota`):
```js
{ noNota, tanggal: '2026-09-27 14:05', kasir, items: [{nama, qty, harga, subtotal}],
  subtotal, diskon, pajak, total, metode, bayar, kembalian, referensi, catatan, status,
  toko: { nama, alamat, telepon, footer, lebarStruk },
  stokBaru: { 'ITM-0001': 8 },     // untuk memperbarui grid tanpa reload
  teks: ['   Toko Contoh', ...] }     // baris struk polos (32/48 kolom) untuk printer thermal (RawBT)
```
