/**
 * Db.js — satu-satunya tempat yang menyentuh sheet dan cache.
 * Kolom dipetakan berdasarkan nama header, bukan nomor kolom.
 */

const VERSI = '1.5.2';

const SHEET = Object.freeze({
  ITEM: 'Item',
  RESEP: 'Resep',
  TRANSAKSI: 'Transaksi',
  DETAIL: 'Detail',
  STOK_LOG: 'Stok_Log',
  HARGA_LOG: 'Harga_Log',
  PENGGUNA: 'Pengguna',
  PENGATURAN: 'Pengaturan',
  KAS: 'Kas',
  SHIFT: 'Shift',
  BILL: 'Bill',
});

// Sumber kebenaran header. Urutan hanya berlaku untuk sheet baru; kolom baru ditambah di ujung kanan.
const SKEMA = Object.freeze({
  Item: ['ID', 'Kode', 'Nama', 'Tipe', 'Kategori', 'Satuan', 'Harga Beli', 'Harga Jual', 'Stok', 'Stok Min', 'Lacak Stok', 'Aktif', 'Foto'],
  Resep: ['ID Menu', 'ID Bahan', 'Qty'],
  Transaksi: ['No Nota', 'Tanggal', 'Kasir', 'Subtotal', 'Diskon', 'Pajak', 'Total', 'Metode', 'Status', 'Referensi', 'Bayar', 'Kembalian', 'Catatan'],
  Detail: ['No Nota', 'ID Item', 'Nama', 'Qty', 'Harga', 'Subtotal', 'HPP Satuan'],
  Stok_Log: ['Tanggal', 'ID Item', 'Nama', 'Jenis', 'Qty', 'Stok Sesudah', 'Ref', 'Kasir/User', 'Keterangan'],
  Harga_Log: ['Tanggal', 'ID Item', 'Harga Beli Lama', 'Harga Beli Baru', 'Harga Jual Lama', 'Harga Jual Baru', 'User'],
  Pengguna: ['Username', 'Nama', 'PIN Hash', 'Salt', 'Role', 'Aktif', 'Ganti PIN'],
  Pengaturan: ['Kunci', 'Nilai'],
  Kas: ['ID', 'Tanggal', 'Jenis', 'Kategori', 'Jumlah', 'Keterangan', 'User', 'Shift'],
  Shift: ['ID', 'Kasir', 'Buka', 'Modal Awal', 'Tutup', 'Jumlah Transaksi', 'Penjualan Tunai', 'Penjualan Non Tunai',
    'Kas Masuk', 'Kas Keluar', 'Kas Seharusnya', 'Kas Fisik', 'Selisih', 'Status', 'Catatan'],
  Bill: ['ID', 'Nama', 'Items', 'Catatan', 'Status', 'Dibuat', 'Diperbarui', 'Kasir', 'No Nota'],
});

const CACHE_TTL = 600; // 10 menit
const CACHE_POTONGAN = 50000; // karakter per kunci, aman di bawah batas 100 KB

// ---------- Baca / tulis tabel ----------

function ambilSheet_(nama) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(nama);
  if (!sheet) throw galat_('SERVER', 'Sheet "' + nama + '" belum ada. Jalankan menu POS > Setup Awal.');
  return sheet;
}

/** Susun objek tabel dari baris header + data; memastikan semua kolom SKEMA ada. */
function susunTabel_(nama, sheet, barisHeader, baris) {
  const header = barisHeader.map(function (h) { return String(h).trim(); });
  const kol = {};
  header.forEach(function (h, i) { if (h && !(h in kol)) kol[h] = i; });
  SKEMA[nama].forEach(function (h) {
    if (!(h in kol)) throw galat_('SERVER', 'Kolom "' + h + '" tidak ada di sheet ' + nama + '. Jalankan menu POS > Setup Awal.');
  });
  return { nama: nama, sheet: sheet, header: header, kol: kol, baris: baris, lebar: header.length };
}

/**
 * Baca seluruh sheet sekali. baris[i] berada di baris sheet ke-(i + 2).
 * Baris kosong TIDAK dibuang agar indeks tetap sama dengan nomor baris sheet;
 * pemakai melewati baris yang kolom kuncinya kosong.
 */
function bacaTabel_(nama) {
  const sheet = ambilSheet_(nama);
  const nilai = sheet.getDataRange().getValues();
  return susunTabel_(nama, sheet, nilai[0] || [], nilai.slice(1));
}

/**
 * Hanya baca header (tanpa data). Untuk sheet append-only yang terus membesar
 * (Transaksi, Detail, Stok_Log, Harga_Log) saat hanya perlu menambah baris.
 */
function bacaHeader_(nama) {
  const sheet = ambilSheet_(nama);
  const lebar = Math.max(sheet.getLastColumn(), 1);
  return susunTabel_(nama, sheet, sheet.getRange(1, 1, 1, lebar).getValues()[0], []);
}

/**
 * Telusuri sheet append-only dari baris terbawah ke atas, dibaca per blok (bukan per baris).
 * fn(row, idx, tabel) mengembalikan false untuk berhenti. idx = indeks data (baris sheet = idx + 2).
 * Dipakai untuk riwayat/transaksi: data kronologis, yang dicari hampir selalu yang terbaru.
 */
function telusuriMundur_(nama, fn, ukuranBlok) {
  const t = bacaHeader_(nama);
  const blok = ukuranBlok || 2000;
  for (let akhir = t.sheet.getLastRow(); akhir >= 2; akhir -= blok) {
    const awal = Math.max(2, akhir - blok + 1);
    const rows = t.sheet.getRange(awal, 1, akhir - awal + 1, t.lebar).getValues();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (fn(rows[i], awal + i - 2, t) === false) return t;
    }
  }
  return t;
}

function keObjek_(tabel, row) {
  const o = {};
  tabel.header.forEach(function (h, i) { if (h) o[h] = row[i]; });
  return o;
}

/**
 * Susun array baris sesuai urutan header sheet dari objek {namaKolom: nilai}.
 * Teks lama dari `dasar` dibaca tanpa apostrof, jadi dilindungi ulang dengan amanSel_
 * agar tidak berubah menjadi formula/angka saat ditulis kembali.
 */
function keBaris_(tabel, obj, dasar) {
  const row = dasar
    ? dasar.map(function (v) { return typeof v === 'string' ? amanSel_(v) : v; })
    : new Array(tabel.lebar).fill('');
  Object.keys(obj).forEach(function (k) {
    if (k in tabel.kol) row[tabel.kol[k]] = obj[k];
  });
  return row;
}

function tambahBaris_(tabel, rows) {
  if (!rows.length) return;
  const awal = tabel.sheet.getLastRow() + 1;
  tabel.sheet.getRange(awal, 1, rows.length, tabel.lebar).setValues(rows);
}

/** Tambah baris dari objek {namaKolom: nilai}; aman walau urutan kolom sheet berbeda. */
function tambahObjek_(tabel, objek) {
  tambahBaris_(tabel, objek.map(function (o) { return keBaris_(tabel, o); }));
}

function tulisBaris_(tabel, idx, row) {
  tabel.sheet.getRange(idx + 2, 1, 1, tabel.lebar).setValues([row]);
}

function tulisSel_(tabel, idx, namaKolom, nilai) {
  tabel.sheet.getRange(idx + 2, tabel.kol[namaKolom] + 1).setValue(nilai);
}

/** Tulis ulang satu kolom untuk semua baris data dalam satu panggilan. */
function tulisKolom_(tabel, namaKolom, nilaiPerBaris) {
  if (!nilaiPerBaris.length) return;
  tabel.sheet
    .getRange(2, tabel.kol[namaKolom] + 1, nilaiPerBaris.length, 1)
    .setValues(nilaiPerBaris.map(function (v) { return [v]; }));
}

/**
 * Tulis ulang semua baris data dalam satu setValues. `tabel.baris` harus berisi nilai MENTAH (seperti hasil getValues,
 * tanpa apostrof): semua teks dilindungi amanSel_ tepat sekali di sini.
 */
function tulisSemuaBaris_(tabel) {
  if (!tabel.baris.length) return;
  tabel.sheet.getRange(2, 1, tabel.baris.length, tabel.lebar).setValues(tabel.baris.map(function (r) {
    const row = r.slice(0, tabel.lebar);
    while (row.length < tabel.lebar) row.push('');
    return row.map(function (v) { return typeof v === 'string' ? amanSel_(v) : v; });
  }));
}

/** Ganti seluruh isi data (tanpa header). Dipakai untuk tabel kecil seperti Resep. */
function gantiIsiTabel_(tabel, rows) {
  const lama = tabel.baris.length;
  if (rows.length) tabel.sheet.getRange(2, 1, rows.length, tabel.lebar).setValues(rows);
  if (lama > rows.length) {
    tabel.sheet.getRange(2 + rows.length, 1, lama - rows.length, tabel.lebar).clearContent();
  }
}

/**
 * Teks dari pengguna diberi awalan apostrof: Sheets menyimpannya sebagai teks apa adanya.
 * Mencegah formula injection (=IMPORTXML...) dan konversi otomatis (kode "00123" jadi angka 123).
 */
function amanSel_(teks) {
  const s = teks === null || teks === undefined ? '' : String(teks);
  return s === '' ? '' : "'" + s;
}

// ---------- Cache berversi ----------

function props_() {
  return PropertiesService.getScriptProperties();
}

function versiCache_(nama) {
  return props_().getProperty('VER_' + nama) || '1';
}

/** Invalidasi: naikkan versi, kunci lama kedaluwarsa sendiri. */
function naikkanVersi_(nama) {
  props_().setProperty('VER_' + nama, String(Number(versiCache_(nama)) + 1));
}

function cacheAmbilJson_(kunci) {
  const cache = CacheService.getScriptCache();
  const jumlah = cache.get(kunci + ':n');
  if (!jumlah) return null;
  const kunciPotongan = [];
  for (let i = 0; i < Number(jumlah); i++) kunciPotongan.push(kunci + ':' + i);
  const potongan = cache.getAll(kunciPotongan);
  let teks = '';
  for (let i = 0; i < kunciPotongan.length; i++) {
    if (potongan[kunciPotongan[i]] === undefined) return null;
    teks += potongan[kunciPotongan[i]];
  }
  return JSON.parse(teks);
}

function cacheSimpanJson_(kunci, obj) {
  const teks = JSON.stringify(obj);
  const isi = {};
  let n = 0;
  for (let i = 0; i < teks.length; i += CACHE_POTONGAN) {
    isi[kunci + ':' + n] = teks.slice(i, i + CACHE_POTONGAN);
    n++;
  }
  isi[kunci + ':n'] = String(n);
  try {
    CacheService.getScriptCache().putAll(isi, CACHE_TTL);
  } catch (e) {
    // Cache hanya percepatan; gagal simpan tidak boleh menggagalkan permintaan.
    console.warn('Gagal menyimpan cache ' + kunci);
  }
}

/** Ambil dari cache berversi, atau hitung dengan fnMuat lalu simpan. */
function denganCache_(nama, fnMuat) {
  const kunci = nama + ':v' + versiCache_(nama);
  const ada = cacheAmbilJson_(kunci);
  if (ada !== null) return ada;
  const baru = fnMuat();
  cacheSimpanJson_(kunci, baru);
  return baru;
}
