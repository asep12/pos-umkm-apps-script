/**
 * Logika.js — fungsi murni. DILARANG memanggil SpreadsheetApp, CacheService, dsb. di file ini
 * agar semuanya bisa dites lewat jalankanTes() (dan Node di lokal).
 * Error bisnis dilempar dengan galat_() dari Code.js.
 */

const TIPE = Object.freeze(['Barang', 'Bahan', 'Menu']);
const METODE = Object.freeze(['Tunai', 'QRIS', 'Transfer']);
const MAKS_BARIS_KERANJANG = 200;
const MAKS_BARIS_RESEP = 50;

// ---------- Angka ----------

function bulatUang_(n) {
  return Math.round(Number(n) || 0);
}

/** Qty boleh desimal (kg, liter); dibulatkan 3 desimal untuk menghindari 0.30000000000000004. */
function bulatQty_(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function angka_(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function margin_(hargaJual, hargaBeli) {
  if (!(hargaJual > 0)) return null;
  return Math.round(((hargaJual - hargaBeli) / hargaJual) * 1000) / 1000;
}

// ---------- Validasi umum ----------

function teksBersih_(v, maks, namaField, wajib) {
  const s = v === null || v === undefined ? '' : String(v).trim();
  if (wajib && !s) throw galat_('VALIDASI', namaField + ' wajib diisi.');
  if (s.length > maks) throw galat_('VALIDASI', namaField + ' maksimal ' + maks + ' karakter.');
  return s;
}

function angkaBersih_(v, namaField, opsi) {
  const o = opsi || {};
  const n = v === '' || v === null || v === undefined ? (o.bawaan !== undefined ? o.bawaan : NaN) : Number(v);
  if (!Number.isFinite(n)) throw galat_('VALIDASI', namaField + ' harus berupa angka.');
  if (o.min !== undefined && n < o.min) throw galat_('VALIDASI', namaField + ' minimal ' + o.min + '.');
  if (o.lebihDari !== undefined && !(n > o.lebihDari)) throw galat_('VALIDASI', namaField + ' harus lebih dari ' + o.lebihDari + '.');
  if (o.maks !== undefined && n > o.maks) throw galat_('VALIDASI', namaField + ' maksimal ' + o.maks + '.');
  return n;
}

function validPin_(pin) {
  return typeof pin === 'string' && /^\d{4,6}$/.test(pin);
}

/** PIN lemah: semua digit sama, atau berurutan naik/turun (1234, 654321). */
function pinLemah_(pin) {
  if (/^(\d)\1+$/.test(pin)) return true;
  let naik = true;
  let turun = true;
  for (let i = 1; i < pin.length; i++) {
    const d = Number(pin[i]) - Number(pin[i - 1]);
    if (d !== 1) naik = false;
    if (d !== -1) turun = false;
  }
  return naik || turun;
}

// ---------- Item ----------

/** Nomor ID berikutnya: ITM-0001, ITM-0002, ... (lebih dari 4 digit bila > 9999). */
function idItemBerikut_(daftarId) {
  let maks = 0;
  daftarId.forEach(function (id) {
    const m = /^ITM-(\d+)$/.exec(String(id));
    if (m) maks = Math.max(maks, Number(m[1]));
  });
  return 'ITM-' + String(maks + 1).padStart(4, '0');
}

/**
 * Barcode EAN-13 dari 12 digit pertama (digit ke-13 = checksum GS1).
 * Awalan 200–299 adalah rentang "in-store" GS1: aman untuk kode internal toko, tidak bentrok dengan produk asli.
 */
function ean13_(dua12) {
  const d = String(dua12);
  if (!/^\d{12}$/.test(d)) throw galat_('VALIDASI', 'EAN-13 butuh 12 digit.');
  let jumlah = 0;
  for (let i = 0; i < 12; i++) jumlah += Number(d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - (jumlah % 10)) % 10);
}

/** Bersihkan input form item. Mengembalikan objek siap simpan atau melempar VALIDASI. */
function normalisasiItem_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data item tidak valid.');
  const tipe = String(input.tipe || '');
  if (TIPE.indexOf(tipe) === -1) throw galat_('VALIDASI', 'Tipe harus Barang, Bahan, atau Menu.');
  const foto = teksBersih_(input.foto, 500, 'Foto');
  if (foto && !/^https:\/\/\S+$/.test(foto)) throw galat_('VALIDASI', 'URL foto harus diawali https://');
  const item = {
    id: input.id ? String(input.id) : '',
    kode: teksBersih_(input.kode, 50, 'Kode'),
    nama: teksBersih_(input.nama, 100, 'Nama', true),
    tipe: tipe,
    kategori: teksBersih_(input.kategori, 50, 'Kategori'),
    satuan: teksBersih_(input.satuan, 20, 'Satuan') || 'pcs',
    hargaBeli: bulatUang_(angkaBersih_(input.hargaBeli, 'Harga beli', { min: 0, bawaan: 0 })),
    hargaJual: bulatUang_(angkaBersih_(input.hargaJual, 'Harga jual', { min: 0, bawaan: 0 })),
    stokAwal: bulatQty_(angkaBersih_(input.stokAwal, 'Stok awal', { min: 0, bawaan: 0 })),
    stokMin: bulatQty_(angkaBersih_(input.stokMin, 'Stok minimum', { min: 0, bawaan: 0 })),
    lacak: input.lacak === true || input.lacak === 'Ya',
    aktif: input.aktif === undefined ? true : input.aktif === true || input.aktif === 'Ya',
    foto: foto,
  };
  if (tipe === 'Bahan') item.hargaJual = 0;
  if (tipe !== 'Bahan' && !(item.hargaJual > 0)) throw galat_('VALIDASI', 'Harga jual wajib diisi untuk ' + tipe + '.');
  // Stok menu tidak dipakai (yang dipotong adalah bahan di resep).
  if (tipe === 'Menu') item.stokAwal = 0;
  return item;
}

/** HPP 1 porsi menu = jumlah (harga beli bahan x qty resep). */
function hitungHppMenu_(barisResep, petaItem) {
  let total = 0;
  barisResep.forEach(function (r) {
    const bahan = petaItem[r.idBahan];
    if (bahan) total += bahan.hargaBeli * r.qty;
  });
  return bulatUang_(total);
}

/**
 * Hitung ulang HPP semua menu yang punya resep.
 * Mengembalikan [{id, lama, baru}] hanya untuk menu yang HPP-nya berubah.
 */
function hppMenuBerubah_(petaItem, petaResep) {
  const hasil = [];
  Object.keys(petaResep).forEach(function (idMenu) {
    const menu = petaItem[idMenu];
    if (!menu || menu.tipe !== 'Menu' || !petaResep[idMenu].length) return;
    const baru = hitungHppMenu_(petaResep[idMenu], petaItem);
    if (baru !== menu.hargaBeli) hasil.push({ id: idMenu, lama: menu.hargaBeli, baru: baru });
  });
  return hasil;
}

/** Validasi baris resep dari klien terhadap daftar item. */
function normalisasiResep_(idMenu, baris, petaItem) {
  const menu = petaItem[idMenu];
  if (!menu) throw galat_('TIDAK_ADA', 'Menu tidak ditemukan.');
  if (menu.tipe !== 'Menu') throw galat_('VALIDASI', 'Resep hanya untuk item bertipe Menu.');
  if (!Array.isArray(baris)) throw galat_('VALIDASI', 'Data resep tidak valid.');
  if (baris.length > MAKS_BARIS_RESEP) throw galat_('VALIDASI', 'Resep maksimal ' + MAKS_BARIS_RESEP + ' bahan.');
  const sudah = {};
  return baris.map(function (b) {
    const idBahan = String((b && b.idBahan) || '');
    const bahan = petaItem[idBahan];
    if (!bahan) throw galat_('VALIDASI', 'Bahan ' + idBahan + ' tidak ditemukan.');
    if (bahan.tipe === 'Menu') throw galat_('VALIDASI', bahan.nama + ' bertipe Menu, tidak bisa jadi bahan.');
    if (sudah[idBahan]) throw galat_('VALIDASI', bahan.nama + ' tercantum lebih dari sekali.');
    sudah[idBahan] = true;
    const qty = bulatQty_(angkaBersih_(b.qty, 'Qty ' + bahan.nama, { lebihDari: 0 }));
    if (!(qty > 0)) throw galat_('VALIDASI', 'Qty ' + bahan.nama + ' terlalu kecil.');
    return { idBahan: idBahan, qty: qty };
  });
}

// ---------- Transaksi ----------

/** Bersihkan input transaksi dari klien (belum menyentuh data item). */
function normalisasiTransaksi_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data transaksi tidak valid.');
  if (!Array.isArray(input.items) || !input.items.length) throw galat_('VALIDASI', 'Keranjang masih kosong.');
  if (input.items.length > MAKS_BARIS_KERANJANG) throw galat_('VALIDASI', 'Keranjang terlalu banyak baris.');
  const metode = String(input.metode || '');
  if (METODE.indexOf(metode) === -1) throw galat_('VALIDASI', 'Metode bayar tidak dikenal.');
  const d = input.diskon || {};
  const jenisDiskon = d.jenis === 'persen' ? 'persen' : 'nominal';
  const nilaiDiskon = angkaBersih_(d.nilai, 'Diskon', { min: 0, bawaan: 0, maks: jenisDiskon === 'persen' ? 100 : undefined });
  return {
    items: gabungQty_(input.items),
    diskon: { jenis: jenisDiskon, nilai: nilaiDiskon },
    metode: metode,
    bayar: metode === 'Tunai' ? angkaBersih_(input.bayar, 'Uang bayar', { min: 0 }) : 0,
    referensi: teksBersih_(input.referensi, 50, 'Referensi'),
    catatan: teksBersih_(input.catatan, 200, 'Catatan'),
  };
}

/** Gabungkan item yang sama dan validasi qty. */
function gabungQty_(items) {
  const urutan = [];
  const qty = {};
  items.forEach(function (b) {
    const id = String((b && b.idItem) || '');
    if (!id) throw galat_('VALIDASI', 'Ada item tanpa ID di keranjang.');
    const q = bulatQty_(angkaBersih_(b.qty, 'Qty', { lebihDari: 0 }));
    if (!(q > 0)) throw galat_('VALIDASI', 'Qty terlalu kecil.');
    if (!(id in qty)) {
      urutan.push(id);
      qty[id] = 0;
    }
    qty[id] = bulatQty_(qty[id] + q);
  });
  return urutan.map(function (id) { return { idItem: id, qty: qty[id] }; });
}

function hitungDiskon_(subtotal, diskon) {
  if (!diskon || !(diskon.nilai > 0)) return 0;
  const nilai = diskon.jenis === 'persen' ? bulatUang_((subtotal * diskon.nilai) / 100) : bulatUang_(diskon.nilai);
  if (nilai > subtotal) throw galat_('VALIDASI', 'Diskon melebihi subtotal.');
  return nilai;
}

/**
 * Hitung seluruh angka transaksi. Harga & HPP diambil dari petaItem (sheet), bukan dari klien.
 * trx = hasil normalisasiTransaksi_. pajakPersen dari Pengaturan.
 */
function hitungTransaksi_(trx, petaItem, pajakPersen) {
  const baris = trx.items.map(function (b) {
    const it = petaItem[b.idItem];
    if (!it) throw galat_('TIDAK_ADA', 'Item ' + b.idItem + ' tidak ditemukan. Muat ulang daftar item.');
    if (!it.aktif) throw galat_('VALIDASI', it.nama + ' sudah tidak aktif. Hapus dari keranjang.');
    if (it.tipe === 'Bahan') throw galat_('VALIDASI', it.nama + ' adalah bahan dan tidak dijual.');
    return {
      idItem: it.id,
      nama: it.nama,
      qty: b.qty,
      harga: it.hargaJual,
      subtotal: bulatUang_(it.hargaJual * b.qty),
      hppSatuan: it.hargaBeli,
    };
  });
  const subtotal = baris.reduce(function (s, b) { return s + b.subtotal; }, 0);
  const diskon = hitungDiskon_(subtotal, trx.diskon);
  const dpp = subtotal - diskon;
  const pajak = bulatUang_((dpp * (Number(pajakPersen) || 0)) / 100);
  const total = dpp + pajak;
  let bayar = total;
  let kembalian = 0;
  if (trx.metode === 'Tunai') {
    bayar = bulatUang_(trx.bayar);
    if (bayar < total) throw galat_('VALIDASI', 'Uang bayar kurang ' + formatRupiahTeks_(total - bayar) + '.');
    kembalian = bayar - total;
  }
  return { baris: baris, subtotal: subtotal, diskon: diskon, pajak: pajak, total: total, bayar: bayar, kembalian: kembalian };
}

/**
 * Kebutuhan stok per item: Barang dipotong langsung, Menu memotong bahan resepnya.
 * Bahan yang dipakai beberapa menu DIJUMLAHKAN agar pengecekan stok tidak lolos.
 */
function hitungKebutuhanStok_(baris, petaItem, petaResep) {
  const butuh = {};
  function tambah(id, qty) {
    butuh[id] = bulatQty_((butuh[id] || 0) + qty);
  }
  baris.forEach(function (b) {
    const it = petaItem[b.idItem];
    if (!it || !it.lacak) return;
    if (it.tipe === 'Menu') {
      (petaResep[it.id] || []).forEach(function (r) {
        const bahan = petaItem[r.idBahan];
        if (bahan && bahan.lacak) tambah(bahan.id, r.qty * b.qty);
      });
    } else {
      tambah(it.id, b.qty);
    }
  });
  return butuh;
}

/** Daftar item yang stoknya tidak cukup. Kosong = aman. */
function cekStok_(butuh, petaItem, izinkanMinus) {
  if (izinkanMinus) return [];
  const kurang = [];
  Object.keys(butuh).forEach(function (id) {
    const it = petaItem[id];
    if (it && it.stok < butuh[id]) {
      kurang.push({ id: id, nama: it.nama, satuan: it.satuan, butuh: butuh[id], ada: it.stok });
    }
  });
  return kurang;
}

function pesanStokKurang_(kurang) {
  return 'Stok tidak cukup: ' + kurang.map(function (k) {
    return k.nama + ' (butuh ' + formatAngkaTeks_(k.butuh) + ' ' + k.satuan + ', tersedia ' + formatAngkaTeks_(k.ada) + ')';
  }).join('; ') + '.';
}

// ---------- Stok ----------

const JENIS_STOK = Object.freeze(['Masuk', 'Keluar', 'Opname', 'Jual', 'Void', 'Koreksi']);
const MAKS_BARIS_OPNAME = 500;

function normalisasiStokMasuk_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data stok masuk tidak valid.');
  const idItem = String(input.idItem || '').trim();
  if (!idItem) throw galat_('VALIDASI', 'Pilih item terlebih dahulu.');
  const qty = bulatQty_(angkaBersih_(input.qty, 'Qty', { lebihDari: 0 }));
  if (!(qty > 0)) throw galat_('VALIDASI', 'Qty terlalu kecil.');
  const adaHarga = input.hargaBeli !== '' && input.hargaBeli !== null && input.hargaBeli !== undefined;
  return {
    idItem: idItem,
    qty: qty,
    hargaBeli: adaHarga ? bulatUang_(angkaBersih_(input.hargaBeli, 'Harga beli', { min: 0 })) : null,
    ref: teksBersih_(input.ref, 50, 'No. faktur'),
    ket: teksBersih_(input.ket, 200, 'Keterangan'),
  };
}

/** Selisih opname per item: stok fisik − stok sistem. */
function hitungOpname_(baris, petaItem) {
  if (!Array.isArray(baris) || !baris.length) throw galat_('VALIDASI', 'Belum ada stok fisik yang diisi.');
  if (baris.length > MAKS_BARIS_OPNAME) throw galat_('VALIDASI', 'Maksimal ' + MAKS_BARIS_OPNAME + ' item per opname.');
  const sudah = {};
  return baris.map(function (b) {
    const id = String((b && b.idItem) || '');
    const it = petaItem[id];
    if (!it) throw galat_('TIDAK_ADA', 'Item ' + id + ' tidak ditemukan.');
    if (it.tipe === 'Menu') throw galat_('VALIDASI', it.nama + ' bertipe Menu; stoknya tidak dihitung.');
    if (sudah[id]) throw galat_('VALIDASI', it.nama + ' tercantum lebih dari sekali.');
    sudah[id] = true;
    const fisik = bulatQty_(angkaBersih_(b.stokFisik, 'Stok fisik ' + it.nama, { min: 0 }));
    return { idItem: id, nama: it.nama, satuan: it.satuan, stokLama: it.stok, stokFisik: fisik, selisih: bulatQty_(fisik - it.stok) };
  });
}

// ---------- Tanggal ----------

function validTanggal_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Rentang 'YYYY-MM-DD' (inklusif). Kosong = hari ini. Dibandingkan sebagai string. */
function rentangTanggal_(dari, sampai, hariIni) {
  const a = dari ? String(dari) : hariIni;
  const b = sampai ? String(sampai) : a > hariIni ? a : hariIni;
  if (!validTanggal_(a) || !validTanggal_(b)) throw galat_('VALIDASI', 'Format tanggal harus YYYY-MM-DD.');
  if (a > b) throw galat_('VALIDASI', 'Tanggal awal tidak boleh setelah tanggal akhir.');
  return { dari: a, sampai: b };
}

/** Geser tanggal 'YYYY-MM-DD' sebanyak n hari (aritmetika UTC, bebas zona waktu). */
function geserHari_(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Semua tanggal dari..sampai (inklusif). */
function daftarHari_(dari, sampai) {
  const hasil = [];
  for (let h = dari; h <= sampai && hasil.length <= 366; h = geserHari_(h, 1)) hasil.push(h);
  return hasil;
}

const MAKS_HARI_LAPORAN = 366;

function rentangLaporan_(dari, sampai, hariIni) {
  const r = rentangTanggal_(dari, sampai, hariIni);
  if (daftarHari_(r.dari, r.sampai).length > MAKS_HARI_LAPORAN) {
    throw galat_('VALIDASI', 'Rentang laporan maksimal ' + MAKS_HARI_LAPORAN + ' hari.');
  }
  return r;
}

// ---------- Laporan ----------

/**
 * Agregasi penjualan. Transaksi Batal tidak dihitung ke penjualan/laba (hanya di `batal`).
 * trx:    [{noNota, hari:'YYYY-MM-DD', jam:0-23, kasir, metode, status, subtotal, diskon, pajak, total}]
 * detail: [{noNota, idItem, nama, qty, subtotal, hpp}]  (hpp = HPP satuan yang disalin saat transaksi)
 * Laba kotor = (subtotal − diskon) − HPP. Pajak bukan pendapatan toko, jadi tidak masuk laba.
 */
function ringkasPenjualan_(trx, detail, rentang) {
  const lunas = {};
  const batal = { jumlah: 0, total: 0 };
  trx.forEach(function (t) {
    if (t.status === 'Batal') {
      batal.jumlah++;
      batal.total += t.total;
    } else {
      lunas[t.noNota] = t;
    }
  });

  const hppNota = {};
  const perItem = {};
  detail.forEach(function (d) {
    if (!lunas[d.noNota]) return;
    const hpp = bulatUang_(d.hpp * d.qty);
    hppNota[d.noNota] = (hppNota[d.noNota] || 0) + hpp;
    const it = perItem[d.idItem] || (perItem[d.idItem] = { idItem: d.idItem, nama: d.nama, qty: 0, omzet: 0, laba: 0 });
    it.qty = bulatQty_(it.qty + d.qty);
    it.omzet += d.subtotal;
    it.laba += d.subtotal - hpp;
  });

  const hari = {};
  daftarHari_(rentang.dari, rentang.sampai).forEach(function (h) { hari[h] = { tanggal: h, jumlah: 0, omzet: 0, laba: 0 }; });
  const metode = {};
  METODE.forEach(function (m) { metode[m] = { metode: m, jumlah: 0, total: 0 }; });
  const kasir = {};
  const jam = [];
  for (let j = 0; j < 24; j++) jam.push({ jam: j, jumlah: 0, omzet: 0 });

  const r = { jumlah: 0, omzet: 0, penjualanBersih: 0, diskon: 0, pajak: 0, hpp: 0, labaKotor: 0 };
  Object.keys(lunas).forEach(function (no) {
    const t = lunas[no];
    const bersih = t.subtotal - t.diskon;
    const laba = bersih - (hppNota[no] || 0);
    r.jumlah++;
    r.omzet += t.total;
    r.penjualanBersih += bersih;
    r.diskon += t.diskon;
    r.pajak += t.pajak;
    r.hpp += hppNota[no] || 0;
    r.labaKotor += laba;
    if (hari[t.hari]) {
      hari[t.hari].jumlah++;
      hari[t.hari].omzet += t.total;
      hari[t.hari].laba += laba;
    }
    const m = metode[t.metode] || (metode[t.metode] = { metode: t.metode, jumlah: 0, total: 0 });
    m.jumlah++;
    m.total += t.total;
    const k = kasir[t.kasir] || (kasir[t.kasir] = { kasir: t.kasir, jumlah: 0, total: 0 });
    k.jumlah++;
    k.total += t.total;
    if (jam[t.jam]) {
      jam[t.jam].jumlah++;
      jam[t.jam].omzet += t.total;
    }
  });

  r.margin = r.penjualanBersih > 0 ? Math.round((r.labaKotor / r.penjualanBersih) * 1000) / 1000 : null;
  r.rataRata = r.jumlah ? bulatUang_(r.omzet / r.jumlah) : 0;
  r.batal = batal;
  r.rentang = rentang;
  r.perHari = Object.keys(hari).sort().map(function (h) { return hari[h]; });
  r.perMetode = Object.keys(metode).map(function (m) { return metode[m]; });
  r.perKasir = Object.keys(kasir).map(function (k) { return kasir[k]; }).sort(function (a, b) { return b.total - a.total; });
  r.perJam = jam;
  r.terlaris = Object.keys(perItem).map(function (id) { return perItem[id]; })
    .sort(function (a, b) { return b.qty - a.qty || b.omzet - a.omzet; });
  return r;
}

// ---------- Struk teks (printer thermal ESC/POS lewat RawBT) ----------

/** Lebar kolom karakter printer thermal: 58 mm = 32, 80 mm = 48 (font A standar). */
function kolomStruk_(lebarMm) {
  return Number(lebarMm) === 80 ? 48 : 32;
}

function potongTeks_(s, n) {
  const t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) : t;
}

/** Pecah teks menjadi baris <= n karakter di batas kata (kata yang terlalu panjang dipotong). */
function bungkusTeks_(s, n) {
  const kata = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const baris = [];
  let kini = '';
  kata.forEach(function (k) {
    while (k.length > n) {
      if (kini) { baris.push(kini); kini = ''; }
      baris.push(k.slice(0, n));
      k = k.slice(n);
    }
    if (!k) return;
    if (!kini) kini = k;
    else if ((kini + ' ' + k).length <= n) kini += ' ' + k;
    else { baris.push(kini); kini = k; }
  });
  if (kini) baris.push(kini);
  return baris;
}

function tengahTeks_(s, n) {
  const t = potongTeks_(s, n);
  return ' '.repeat(Math.floor((n - t.length) / 2)) + t;
}

/** "Kiri ........ kanan" tepat n karakter; kiri dipotong bila perlu. */
function kiriKananTeks_(kiri, kanan, n) {
  const b = potongTeks_(kanan, n);
  const a = potongTeks_(kiri, Math.max(n - b.length - 1, 0));
  return a + ' '.repeat(Math.max(n - a.length - b.length, 1)) + b;
}

/** Struk sebagai baris teks polos (tanpa kode printer) untuk printer thermal. */
function strukTeks_(nota, kolom) {
  const n = kolom;
  const t = nota.toko || {};
  const garis = '-'.repeat(n);
  const rp = function (x) { return formatAngkaTeks_(bulatUang_(x)); };
  const baris = [];
  bungkusTeks_(t.nama, n).forEach(function (b) { baris.push(tengahTeks_(b, n)); });
  bungkusTeks_(t.alamat, n).forEach(function (b) { baris.push(tengahTeks_(b, n)); });
  if (t.telepon) baris.push(tengahTeks_('Telp. ' + t.telepon, n));
  baris.push(garis);
  baris.push(kiriKananTeks_('No', nota.noNota, n));
  baris.push(kiriKananTeks_('Tanggal', nota.tanggal, n));
  baris.push(kiriKananTeks_('Kasir', nota.kasir, n));
  if (nota.status === 'Batal') baris.push(tengahTeks_('*** DIBATALKAN ***', n));
  baris.push(garis);
  (nota.items || []).forEach(function (i) {
    bungkusTeks_(i.nama, n).forEach(function (b) { baris.push(b); });
    baris.push(kiriKananTeks_('  ' + formatAngkaTeks_(i.qty) + ' x ' + rp(i.harga), rp(i.subtotal), n));
  });
  baris.push(garis);
  baris.push(kiriKananTeks_('Subtotal', rp(nota.subtotal), n));
  if (nota.diskon) baris.push(kiriKananTeks_('Diskon', '-' + rp(nota.diskon), n));
  if (nota.pajak) baris.push(kiriKananTeks_('Pajak', rp(nota.pajak), n));
  baris.push(kiriKananTeks_('TOTAL', 'Rp ' + rp(nota.total), n));
  baris.push(kiriKananTeks_(nota.metode, rp(nota.bayar), n));
  if (nota.metode === 'Tunai') baris.push(kiriKananTeks_('Kembalian', rp(nota.kembalian), n));
  if (nota.referensi) baris.push(kiriKananTeks_('Ref', nota.referensi, n));
  if (nota.catatan) bungkusTeks_('Catatan: ' + nota.catatan, n).forEach(function (b) { baris.push(b); });
  baris.push(garis);
  bungkusTeks_(t.footer, n).forEach(function (b) { baris.push(tengahTeks_(b, n)); });
  return baris;
}

/** Rekap tutup kasir sebagai teks printer thermal. */
function rekapTeks_(r, kolom) {
  const n = kolom;
  const garis = '-'.repeat(n);
  const rp = function (x) { return formatAngkaTeks_(bulatUang_(x)); };
  const baris = [tengahTeks_((r.toko || {}).nama, n), tengahTeks_(r.status === 'Tutup' ? 'REKAP TUTUP KASIR' : 'REKAP SHIFT (BERJALAN)', n), garis,
    kiriKananTeks_('Shift', r.id, n), kiriKananTeks_('Kasir', r.namaKasir, n), kiriKananTeks_('Buka', r.buka, n)];
  if (r.tutup) baris.push(kiriKananTeks_('Tutup', r.tutup, n));
  baris.push(garis, kiriKananTeks_('Modal awal', rp(r.modalAwal), n), kiriKananTeks_('Penjualan tunai', rp(r.penjualanTunai), n),
    kiriKananTeks_('Kas masuk', rp(r.kasMasuk), n), kiriKananTeks_('Kas keluar', '-' + rp(r.kasKeluar), n),
    kiriKananTeks_('SEHARUSNYA', 'Rp ' + rp(r.kasSeharusnya), n));
  if (r.kasFisik !== null && r.kasFisik !== undefined) baris.push(kiriKananTeks_('UANG FISIK', 'Rp ' + rp(r.kasFisik), n));
  if (r.selisih !== null && r.selisih !== undefined) baris.push(kiriKananTeks_('Selisih', (r.selisih > 0 ? '+' : '') + rp(r.selisih), n));
  baris.push(garis, kiriKananTeks_('Non tunai', rp(r.penjualanNonTunai), n), kiriKananTeks_('Transaksi', formatAngkaTeks_(r.jumlahTrx), n));
  if (r.catatan) bungkusTeks_('Catatan: ' + r.catatan, n).forEach(function (b) { baris.push(b); });
  return baris;
}

// ---------- Impor item (tempel dari Excel / CSV) ----------

const MAKS_BARIS_IMPOR = 1000;

/** Angka format Indonesia/Excel: "17.000", "Rp 17.000", "1,5", "1.000,25", "17000" -> Number (NaN bila bukan angka). */
function angkaIndonesia_(v) {
  if (typeof v === 'number') return v;
  let s = String(v === null || v === undefined ? '' : v).replace(/rp/ig, '').replace(/\s/g, '');
  if (!s) return NaN;
  if (s.indexOf(',') !== -1) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Teks tabel -> {header, baris}. Pemisah dideteksi dari baris judul: tab (tempel dari Excel/Sheets), ";" (CSV Excel
 * Indonesia), atau ",". Mendukung sel berkutip ("a, b" dan "" untuk kutip). Baris kosong dibuang.
 */
function parseTabelTeks_(teks) {
  const t = String(teks || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const pertama = t.split('\n')[0] || '';
  const hitung = function (c) { return pertama.split(c).length - 1; };
  const pemisah = hitung('\t') ? '\t' : hitung(';') >= hitung(',') && hitung(';') ? ';' : ',';
  const baris = [];
  let sel = '';
  let kini = [];
  let dalamKutip = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dalamKutip) {
      if (c === '"' && t[i + 1] === '"') { sel += '"'; i++; } else if (c === '"') dalamKutip = false; else sel += c;
    } else if (c === '"' && sel === '') dalamKutip = true;
    else if (c === pemisah) { kini.push(sel); sel = ''; }
    else if (c === '\n') { kini.push(sel); baris.push(kini); kini = []; sel = ''; }
    else sel += c;
  }
  if (sel !== '' || kini.length) { kini.push(sel); baris.push(kini); }
  const bersih = baris.map(function (r) { return r.map(function (x) { return String(x).trim(); }); })
    .filter(function (r) { return r.some(function (x) { return x !== ''; }); });
  return { pemisah: pemisah, header: bersih[0] || [], baris: bersih.slice(1) };
}

/** Cocokkan judul kolom bebas ke field item. Nama wajib ada. */
function petaKolomImpor_(header) {
  const sinonim = {
    nama: ['nama', 'nama item', 'nama barang', 'nama produk', 'produk', 'barang', 'item'],
    tipe: ['tipe', 'jenis', 'type'],
    kategori: ['kategori', 'kelompok', 'golongan', 'category'],
    satuan: ['satuan', 'unit', 'uom'],
    hargaBeli: ['harga beli', 'hpp', 'modal', 'harga modal', 'hb', 'harga pokok'],
    hargaJual: ['harga jual', 'harga', 'hj', 'harga ecer', 'price'],
    stokAwal: ['stok', 'stok awal', 'qty', 'jumlah', 'stock'],
    stokMin: ['stok min', 'stok minimum', 'minimum', 'min stok', 'batas stok'],
    kode: ['kode', 'barcode', 'sku', 'kode barang', 'plu'],
    lacak: ['lacak stok', 'lacak', 'track'],
  };
  const peta = {};
  header.forEach(function (h, i) {
    const k = String(h).toLowerCase().replace(/[_*:]/g, ' ').replace(/\s+/g, ' ').trim();
    Object.keys(sinonim).forEach(function (f) {
      if (peta[f] === undefined && sinonim[f].indexOf(k) !== -1) peta[f] = i;
    });
  });
  if (peta.nama === undefined) throw galat_('VALIDASI', 'Kolom "Nama" tidak ditemukan di baris judul.');
  return peta;
}

/** Satu baris tabel -> input untuk normalisasiItem_ (Tipe bawaan Barang, Lacak bawaan Ya). */
function barisImporKeItem_(r, peta) {
  const ambil = function (f) { return peta[f] === undefined ? '' : String(r[peta[f]] === undefined ? '' : r[peta[f]]).trim(); };
  const angka = function (f, nama) {
    const s = ambil(f);
    if (!s) return '';
    const n = angkaIndonesia_(s);
    if (!Number.isFinite(n)) throw galat_('VALIDASI', nama + ' "' + s + '" bukan angka.');
    return n;
  };
  const tipeMentah = ambil('tipe').toLowerCase();
  const tipe = !tipeMentah ? 'Barang' : tipeMentah.charAt(0).toUpperCase() + tipeMentah.slice(1);
  const lacak = ambil('lacak').toLowerCase();
  return {
    nama: ambil('nama'), tipe: tipe, kategori: ambil('kategori'), satuan: ambil('satuan'), kode: ambil('kode'),
    hargaBeli: angka('hargaBeli', 'Harga beli'), hargaJual: angka('hargaJual', 'Harga jual'),
    stokAwal: angka('stokAwal', 'Stok'), stokMin: angka('stokMin', 'Stok min'),
    lacak: !lacak || ['ya', 'y', 'yes', '1', 'true'].indexOf(lacak) !== -1,
  };
}

// ---------- Persediaan ----------

/** Nilai persediaan = stok × harga beli untuk item aktif yang dilacak & punya stok (Menu tidak punya stok). */
function hitungPersediaan_(items) {
  const r = { nilai: 0, jumlahItem: 0, perKategori: [] };
  const peta = {};
  items.forEach(function (i) {
    if (!i.aktif || !i.lacak || i.tipe === 'Menu' || !(i.stok > 0)) return;
    const nilai = bulatUang_(i.stok * i.hargaBeli);
    r.nilai += nilai;
    r.jumlahItem++;
    const k = i.kategori || 'Tanpa kategori';
    if (!peta[k]) { peta[k] = { kategori: k, nilai: 0, jumlahItem: 0 }; r.perKategori.push(peta[k]); }
    peta[k].nilai += nilai;
    peta[k].jumlahItem++;
  });
  r.perKategori.sort(function (a, b) { return b.nilai - a.nilai; });
  return r;
}

// ---------- Barcode EAN-13 (pola batang untuk label) ----------

/** 13 digit -> 95 modul ("1" = batang hitam). Melempar VALIDASI bila digit cek salah. */
function ean13Bits_(kode) {
  const d = String(kode || '');
  if (!/^\d{13}$/.test(d) || ean13_(d.slice(0, 12)) !== d) throw galat_('VALIDASI', 'Kode ' + d + ' bukan EAN-13 yang valid.');
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARITAS = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const pola = PARITAS[Number(d[0])];
  let bit = '101';
  for (let i = 1; i <= 6; i++) bit += (pola[i - 1] === 'L' ? L : G)[Number(d[i])];
  bit += '01010';
  for (let i = 7; i <= 12; i++) bit += R[Number(d[i])];
  return bit + '101';
}

/** Barcode otomatis stabil dari ID item: ITM-0057 -> 200 000000057 + cek. */
function kodeDariIdItem_(id) {
  const m = /^ITM-(\d+)$/.exec(String(id));
  if (!m || m[1].length > 9) return '';
  return ean13_('200' + m[1].padStart(9, '0'));
}

// ---------- Harga massal ----------

/**
 * Validasi input ubah harga massal. mode 'persen' (−90..+500) atau 'nominal' (±10 juta).
 * bulat: pembulatan KE ATAS ke kelipatan 0/100/500/1000 (harga eceran rapi).
 */
function normalisasiHargaMassal_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data harga massal tidak valid.');
  const mode = input.mode === 'nominal' ? 'nominal' : 'persen';
  const nilai = mode === 'persen'
    ? angkaBersih_(input.nilai, 'Persen', { min: -90, maks: 500 })
    : bulatUang_(angkaBersih_(input.nilai, 'Nominal', { min: -10000000, maks: 10000000 }));
  if (!nilai) throw galat_('VALIDASI', 'Isi besar perubahan harga (tidak boleh 0).');
  const bulat = Number(input.bulat) || 0;
  if ([0, 100, 500, 1000].indexOf(bulat) === -1) throw galat_('VALIDASI', 'Pembulatan harus 0, 100, 500, atau 1000.');
  const tipe = String(input.tipe || '');
  if (tipe && ['Barang', 'Menu'].indexOf(tipe) === -1) throw galat_('VALIDASI', 'Tipe harus Barang atau Menu.');
  return { mode: mode, nilai: nilai, bulat: bulat, tipe: tipe, kategori: teksBersih_(input.kategori, 50, 'Kategori') };
}

/** Harga jual baru untuk item terpilih. Mengembalikan [{id, nama, lama, baru}] (hanya yang berubah). */
function hitungHargaMassal_(items, opsi) {
  const hasil = [];
  items.forEach(function (i) {
    if (!i.aktif || i.tipe === 'Bahan') return;
    if (opsi.tipe && i.tipe !== opsi.tipe) return;
    if (opsi.kategori && i.kategori !== opsi.kategori) return;
    const mentah = opsi.mode === 'persen' ? i.hargaJual * (1 + opsi.nilai / 100) : i.hargaJual + opsi.nilai;
    const baru = opsi.bulat ? Math.ceil(Math.round(mentah) / opsi.bulat) * opsi.bulat : bulatUang_(mentah);
    if (!(baru > 0)) throw galat_('VALIDASI', 'Harga ' + i.nama + ' akan menjadi Rp 0 atau kurang. Perkecil penurunan.');
    if (baru !== i.hargaJual) hasil.push({ id: i.id, nama: i.nama, kategori: i.kategori, lama: i.hargaJual, baru: baru });
  });
  return hasil;
}

// ---------- Bill terbuka ----------

function normalisasiBill_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data bill tidak valid.');
  if (!Array.isArray(input.items) || !input.items.length) throw galat_('VALIDASI', 'Bill tidak boleh kosong.');
  if (input.items.length > MAKS_BARIS_KERANJANG) throw galat_('VALIDASI', 'Bill terlalu banyak baris.');
  return {
    id: input.id ? String(input.id) : '',
    nama: teksBersih_(input.nama, 40, 'Nama/meja', true),
    items: gabungQty_(input.items),
    catatan: teksBersih_(input.catatan, 200, 'Catatan'),
    versi: input.versi ? String(input.versi) : '',
  };
}

// ---------- Kas & shift ----------

const KATEGORI_KAS = Object.freeze({
  Masuk: ['Tambahan modal', 'Pendapatan lain', 'Lainnya'],
  Keluar: ['Operasional', 'Belanja stok', 'Gaji', 'Setoran ke pemilik', 'Lainnya'],
});
// Kas keluar yang mengurangi laba. "Belanja stok" sudah tercermin di HPP, "Setoran" hanya memindah uang.
const KAS_BIAYA = Object.freeze(['Operasional', 'Gaji', 'Lainnya']);
const KAS_PENDAPATAN = Object.freeze(['Pendapatan lain']);
const PECAHAN_UANG = Object.freeze([100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100]);

function normalisasiKas_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data kas tidak valid.');
  const jenis = String(input.jenis || '');
  if (!KATEGORI_KAS[jenis]) throw galat_('VALIDASI', 'Jenis kas harus Masuk atau Keluar.');
  const kategori = String(input.kategori || '');
  if (KATEGORI_KAS[jenis].indexOf(kategori) === -1) throw galat_('VALIDASI', 'Kategori kas tidak dikenal.');
  const jumlah = bulatUang_(angkaBersih_(input.jumlah, 'Jumlah', { lebihDari: 0 }));
  if (!(jumlah > 0)) throw galat_('VALIDASI', 'Jumlah harus lebih dari 0.');
  return { jenis: jenis, kategori: kategori, jumlah: jumlah, keterangan: teksBersih_(input.keterangan, 200, 'Keterangan', kategori === 'Lainnya') };
}

/** Total uang dari hitungan per pecahan {100000: 3, 5000: 2, ...}. */
function hitungPecahan_(pecahan) {
  if (!pecahan || typeof pecahan !== 'object') throw galat_('VALIDASI', 'Data pecahan tidak valid.');
  return Object.keys(pecahan).reduce(function (total, k) {
    const nilai = Number(k);
    if (PECAHAN_UANG.indexOf(nilai) === -1) throw galat_('VALIDASI', 'Pecahan ' + k + ' tidak dikenal.');
    const jumlah = angkaBersih_(pecahan[k], 'Jumlah lembar', { min: 0, bawaan: 0 });
    if (Math.floor(jumlah) !== jumlah) throw galat_('VALIDASI', 'Jumlah lembar harus bilangan bulat.');
    return total + nilai * jumlah;
  }, 0);
}

/**
 * Rekap laci kasir. trx: [{metode, status, total}] milik kasir selama shift; kas: [{jenis, jumlah}] milik shift.
 * Uang seharusnya di laci = modal awal + penjualan tunai + kas masuk − kas keluar.
 */
function rekapShift_(modalAwal, trx, kas) {
  const r = { modalAwal: bulatUang_(modalAwal), jumlahTrx: 0, batal: 0, penjualanTunai: 0, penjualanNonTunai: 0, kasMasuk: 0, kasKeluar: 0 };
  trx.forEach(function (t) {
    if (t.status === 'Batal') {
      r.batal++;
      return;
    }
    r.jumlahTrx++;
    if (t.metode === 'Tunai') r.penjualanTunai += t.total;
    else r.penjualanNonTunai += t.total;
  });
  kas.forEach(function (k) {
    if (k.jenis === 'Masuk') r.kasMasuk += k.jumlah;
    else r.kasKeluar += k.jumlah;
  });
  r.kasSeharusnya = r.modalAwal + r.penjualanTunai + r.kasMasuk - r.kasKeluar;
  return r;
}

/** Ringkasan arus kas untuk laporan: biaya & pendapatan lain dipakai menghitung laba bersih. */
function ringkasKas_(kas) {
  const r = { masuk: 0, keluar: 0, biaya: 0, pendapatanLain: 0, perKategori: [] };
  const peta = {};
  kas.forEach(function (k) {
    if (k.jenis === 'Masuk') r.masuk += k.jumlah;
    else r.keluar += k.jumlah;
    if (k.jenis === 'Keluar' && KAS_BIAYA.indexOf(k.kategori) !== -1) r.biaya += k.jumlah;
    if (k.jenis === 'Masuk' && KAS_PENDAPATAN.indexOf(k.kategori) !== -1) r.pendapatanLain += k.jumlah;
    const kunci = k.jenis + '|' + k.kategori;
    if (!peta[kunci]) {
      peta[kunci] = { jenis: k.jenis, kategori: k.kategori, jumlah: 0, total: 0 };
      r.perKategori.push(peta[kunci]);
    }
    peta[kunci].jumlah++;
    peta[kunci].total += k.jumlah;
  });
  r.perKategori.sort(function (a, b) { return b.total - a.total; });
  return r;
}

// ---------- Pengaturan & pengguna ----------

const MODE_USAHA = Object.freeze(['Retail', 'F&B', 'Campuran']);
const ZONA_WAKTU_ID = Object.freeze(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']);

/** Input form pengaturan (camelCase) -> {KUNCI: nilai} siap simpan. */
function normalisasiPengaturan_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data pengaturan tidak valid.');
  const mode = String(input.mode || '');
  if (MODE_USAHA.indexOf(mode) === -1) throw galat_('VALIDASI', 'Mode usaha harus Retail, F&B, atau Campuran.');
  const zona = String(input.zonaWaktu || '');
  if (ZONA_WAKTU_ID.indexOf(zona) === -1) throw galat_('VALIDASI', 'Zona waktu tidak dikenal.');
  const lebar = Number(input.lebarStruk);
  if (lebar !== 58 && lebar !== 80) throw galat_('VALIDASI', 'Lebar struk harus 58 atau 80.');
  const prefix = String(input.prefixNota || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(prefix)) throw galat_('VALIDASI', 'Prefix nota 1–10 huruf/angka tanpa spasi.');
  const pajak = angkaBersih_(input.pajakPersen, 'Pajak', { min: 0, maks: 100, bawaan: 0 });
  return {
    NAMA_USAHA: teksBersih_(input.nama, 100, 'Nama usaha', true),
    ALAMAT: teksBersih_(input.alamat, 200, 'Alamat'),
    TELEPON: teksBersih_(input.telepon, 30, 'Telepon'),
    MODE_USAHA: mode,
    PAJAK_PERSEN: Math.round(pajak * 100) / 100,
    FOOTER_STRUK: teksBersih_(input.footer, 200, 'Footer struk'),
    LEBAR_STRUK: lebar,
    PREFIX_NOTA: prefix,
    ZONA_WAKTU: zona,
    IZINKAN_STOK_MINUS: input.izinkanStokMinus === true || input.izinkanStokMinus === 'Ya' ? 'Ya' : 'Tidak',
    WAJIB_BUKA_KASIR: input.wajibBukaKasir === true || input.wajibBukaKasir === 'Ya' ? 'Ya' : 'Tidak',
  };
}

function normalisasiPengguna_(input) {
  if (!input || typeof input !== 'object') throw galat_('VALIDASI', 'Data pengguna tidak valid.');
  const username = String(input.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw galat_('VALIDASI', 'Username 3–30 karakter: huruf kecil, angka, titik, minus, atau garis bawah.');
  }
  const role = String(input.role || '');
  if (role !== 'Admin' && role !== 'Kasir') throw galat_('VALIDASI', 'Role harus Admin atau Kasir.');
  return {
    username: username,
    nama: teksBersih_(input.nama, 60, 'Nama', true),
    role: role,
    aktif: input.aktif === undefined ? true : input.aktif === true || input.aktif === 'Ya',
    resetPin: input.resetPin === true,
    baru: input.baru === true,
  };
}

function adaAdminAktif_(daftar) {
  return daftar.some(function (p) { return p.role === 'Admin' && p.aktif; });
}

// ---------- Nomor nota ----------

/** simpanan = "yyMMdd|n" terakhir. Urutan reset ke 1 saat tanggal berganti. */
function urutNotaBerikut_(simpanan, hariIni) {
  const bagian = String(simpanan || '').split('|');
  if (bagian[0] === hariIni && Number(bagian[1]) > 0) return Number(bagian[1]) + 1;
  return 1;
}

function formatNomorNota_(prefix, hariIni, urut) {
  return prefix + '-' + hariIni + '-' + String(urut).padStart(4, '0');
}

// ---------- Format teks (untuk pesan server) ----------

function formatAngkaTeks_(n) {
  const s = String(bulatQty_(n)).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return s.join(',');
}

function formatRupiahTeks_(n) {
  return 'Rp ' + formatAngkaTeks_(bulatUang_(n));
}

/**
 * Daftar "Perlu tindakan" untuk Beranda: hanya hal yang menuntut tindakan pemilik, urut paling mendesak dulu.
 * d = { hariIni:'yyyy-MM-dd', menipis:[{stok}], shift:[{nama, hariBuka, buka}], bill:[{hari}] }
 * → [{ jenis, tingkat:'bahaya'|'peringatan'|'info', judul, ket, tujuan:'stok'|'kas'|'bill' }]
 * Shift yang dibuka hari ini dianggap normal (sedang berjualan), jadi tidak dimunculkan.
 */
function susunPerhatian_(d) {
  const hasil = [];
  const menipis = d.menipis || [];
  const habis = menipis.filter(function (i) { return Number(i.stok) <= 0; }).length;
  const tipis = menipis.length - habis;
  if (habis) {
    hasil.push({ jenis: 'stok', tingkat: 'bahaya', judul: habis + ' item stok habis',
      ket: 'Tidak bisa dijual sampai ada stok masuk.', tujuan: 'stok' });
  }
  (d.shift || []).filter(function (s) { return s.hariBuka && s.hariBuka < d.hariIni; }).forEach(function (s) {
    hasil.push({ jenis: 'shift', tingkat: 'peringatan', judul: 'Kasir ' + s.nama + ' belum ditutup',
      ket: 'Dibuka ' + s.buka + '. Tutup & hitung laci agar rekap kas benar.', tujuan: 'kas' });
  });
  if (tipis) {
    hasil.push({ jenis: 'stok', tingkat: 'peringatan', judul: tipis + ' item hampir habis',
      ket: 'Sudah mencapai stok minimum.', tujuan: 'stok' });
  }
  const bill = d.bill || [];
  if (bill.length) {
    const lama = bill.filter(function (b) { return b.hari && b.hari < d.hariIni; }).length;
    hasil.push({ jenis: 'bill', tingkat: lama ? 'peringatan' : 'info', judul: bill.length + ' bill belum dibayar',
      ket: lama ? lama + ' di antaranya dari hari sebelumnya.' : 'Pesanan meja/pelanggan yang masih terbuka.', tujuan: 'bill' });
  }
  const urutan = { bahaya: 0, peringatan: 1, info: 2 };
  return hasil.sort(function (a, b) { return urutan[a.tingkat] - urutan[b.tingkat]; });
}
