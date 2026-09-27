/**
 * Laporan.js — dashboard, laporan penjualan, produk terlaris, ekspor ke sheet. Khusus Admin.
 * Semua angka dihitung oleh ringkasPenjualan_ (Logika.js); file ini hanya mengumpulkan data.
 * PDF dibuat dari browser (Cetak › Simpan sebagai PDF) agar tidak butuh izin Drive tambahan.
 */

function laporanRingkas(token, rentang) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const tz = zonaWaktu_(bacaPengaturan_());
    const r = rentangLaporan_((rentang || {}).dari, (rentang || {}).sampai, hariIni_(tz));
    return susunLaporan_(r, tz, 10);
  });
}

function laporanTerlaris(token, opsi) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const o = opsi || {};
    const tz = zonaWaktu_(bacaPengaturan_());
    const r = rentangLaporan_(o.dari, o.sampai, hariIni_(tz));
    const batas = Math.min(Math.max(Number(o.limit) || 20, 1), 100);
    const data = kumpulkanPenjualan_(r, tz);
    return ringkasPenjualan_(data.trx, data.detail, r).terlaris.slice(0, batas);
  });
}

/** Ringkasan beranda Admin: hari ini vs kemarin, 7 hari terakhir, terlaris, jam ramai, stok menipis. */
function dashboard(token) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const tz = zonaWaktu_(bacaPengaturan_());
    const hariIni = hariIni_(tz);
    const kemarin = geserHari_(hariIni, -1);
    const rentang7 = { dari: geserHari_(hariIni, -6), sampai: hariIni };
    const data = kumpulkanPenjualan_(rentang7, tz);
    const pengguna = petaPengguna_();

    const padaHari = function (h) {
      const trx = data.trx.filter(function (t) { return t.hari === h; });
      const nota = {};
      trx.forEach(function (t) { nota[t.noNota] = true; });
      return ringkasPenjualan_(trx, data.detail.filter(function (d) { return nota[d.noNota]; }), { dari: h, sampai: h });
    };
    const rHariIni = padaHari(hariIni);
    const rKemarin = padaHari(kemarin);
    const r7 = ringkasPenjualan_(data.trx, data.detail, rentang7);
    const menipis = daftarItemCache_().filter(stokMenipis_)
      .sort(function (a, b) { return (a.stok - a.stokMin) - (b.stok - b.stokMin); });

    const peta = petaPengguna_();
    const semuaItem = daftarItemCache_();
    return {
      tanggal: hariIni,
      // Untuk kartu "Mulai cepat" pada toko baru.
      penyiapan: {
        namaBawaan: String(bacaPengaturan_().NAMA_USAHA || '') === pengaturanDefault_().NAMA_USAHA,
        jumlahItem: semuaItem.length,
        jumlahKasir: Object.keys(peta).filter(function (u) { return peta[u].role === ROLE.KASIR && peta[u].aktif; }).length,
        adaTransaksi: data.trx.length > 0,
      },
      hariIni: ringkasKecil_(rHariIni),
      kemarin: ringkasKecil_(rKemarin),
      perMetodeHariIni: rHariIni.perMetode,
      tujuhHari: r7.perHari,
      perJam: r7.perJam,
      terlaris: r7.terlaris.slice(0, 5),
      menipis: { jumlah: menipis.length, daftar: menipis.slice(0, 5).map(function (i) { return itemUntukKlien_(i, true); }) },
      terakhir: data.trx.slice(0, 5).map(function (t) {
        return {
          noNota: t.noNota, waktu: t.waktu, total: t.total, metode: t.metode, status: t.status,
          kasir: pengguna[t.kasir] ? pengguna[t.kasir].nama : t.kasir,
        };
      }),
    };
  });
}

/** Buat sheet laporan baru di Spreadsheet ini. PDF: dari browser (Cetak › Simpan sebagai PDF). */
function eksporLaporan(token, rentang) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    const atur = bacaPengaturan_();
    const tz = zonaWaktu_(atur);
    const r = rentangLaporan_((rentang || {}).dari, (rentang || {}).sampai, hariIni_(tz));
    const lap = susunLaporan_(r, tz, 50);
    return tulisSheetLaporan_(lap, infoToko_(atur), sesi, tz);
  });
}

// ---------- Internal ----------

function hariIni_(tz) {
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function ringkasKecil_(r) {
  return {
    jumlah: r.jumlah, omzet: r.omzet, labaKotor: r.labaKotor, rataRata: r.rataRata,
    margin: r.margin, batal: r.batal.jumlah,
  };
}

function susunLaporan_(r, tz, batasTerlaris) {
  const data = kumpulkanPenjualan_(r, tz);
  const lap = ringkasPenjualan_(data.trx, data.detail, r);
  // Arus kas: biaya usaha & pendapatan lain -> laba bersih (perkiraan).
  lap.kas = ringkasKas_(kumpulkanKas_(r, tz));
  lap.labaBersih = lap.labaKotor + lap.kas.pendapatanLain - lap.kas.biaya;
  const pengguna = petaPengguna_();
  lap.perKasir.forEach(function (k) { k.nama = pengguna[k.kasir] ? pengguna[k.kasir].nama : k.kasir; });
  lap.terlaris = lap.terlaris.slice(0, batasTerlaris);
  return lap;
}

/**
 * Kumpulkan transaksi dalam rentang + baris Detail-nya, dibaca mundur.
 * Detail satu nota ditulis berurutan; berhenti setelah semua nota rentang ditemukan.
 */
function kumpulkanPenjualan_(rentang, tz) {
  const trx = [];
  const dalamRentang = {};
  telusuriMundur_(SHEET.TRANSAKSI, function (r, i, t) {
    const tgl = r[t.kol.Tanggal];
    if (!(tgl instanceof Date)) return true;
    const waktu = Utilities.formatDate(tgl, tz, 'yyyy-MM-dd HH:mm');
    const hari = waktu.slice(0, 10);
    if (hari < rentang.dari) return false;
    if (hari > rentang.sampai) return true;
    const no = String(r[t.kol['No Nota']]).trim().toUpperCase();
    dalamRentang[no] = true;
    trx.push({
      noNota: no, hari: hari, jam: Number(waktu.slice(11, 13)), waktu: waktu,
      kasir: String(r[t.kol.Kasir]).toLowerCase(), metode: String(r[t.kol.Metode]), status: String(r[t.kol.Status]),
      subtotal: angka_(r[t.kol.Subtotal]), diskon: angka_(r[t.kol.Diskon]), pajak: angka_(r[t.kol.Pajak]), total: angka_(r[t.kol.Total]),
    });
    return true;
  });

  const detail = [];
  let sisa = trx.length;
  const ditemukan = {};
  if (sisa) {
    telusuriMundur_(SHEET.DETAIL, function (r, i, t) {
      const no = String(r[t.kol['No Nota']]).trim().toUpperCase();
      if (!dalamRentang[no]) return sisa > 0;
      if (!ditemukan[no]) {
        ditemukan[no] = true;
        sisa--;
      }
      detail.push({
        noNota: no, idItem: String(r[t.kol['ID Item']]), nama: String(r[t.kol.Nama]),
        qty: angka_(r[t.kol.Qty]), subtotal: angka_(r[t.kol.Subtotal]), hpp: angka_(r[t.kol['HPP Satuan']]),
      });
      return true;
    });
  }
  return { trx: trx, detail: detail };
}

function tulisSheetLaporan_(lap, toko, sesi, tz) {
  const ss = SpreadsheetApp.getActive();
  const dasar = 'Lap ' + lap.rentang.dari + ' sd ' + lap.rentang.sampai;
  let nama = dasar;
  for (let n = 2; ss.getSheetByName(nama); n++) nama = dasar + ' (' + n + ')';

  const L = 4;
  const rows = [];
  const judul = []; // nomor baris (1-based) yang ditebalkan
  const baris = function (a) { const r = a.slice(); while (r.length < L) r.push(''); rows.push(r); };
  const bagian = function (teks) { baris([]); baris([teks]); judul.push(rows.length); };
  const teks = function (s) { return amanSel_(s); };

  baris([teks('Laporan Penjualan — ' + toko.nama)]);
  judul.push(1);
  baris(['Periode', teks(lap.rentang.dari + ' s.d. ' + lap.rentang.sampai)]);
  baris(['Dibuat', teks(Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') + ' oleh ' + sesi.u)]);
  bagian('RINGKASAN');
  baris(['Jumlah transaksi', lap.jumlah]);
  baris(['Penjualan (termasuk pajak)', lap.omzet]);
  baris(['Diskon', lap.diskon]);
  baris(['Pajak', lap.pajak]);
  baris(['Penjualan bersih', lap.penjualanBersih]);
  baris(['HPP', lap.hpp]);
  baris(['Laba kotor', lap.labaKotor]);
  baris(['Biaya usaha (kas keluar)', lap.kas.biaya]);
  baris(['Pendapatan lain (kas masuk)', lap.kas.pendapatanLain]);
  baris(['Laba bersih (perkiraan)', lap.labaBersih]);
  baris(['Margin laba kotor', teks(lap.margin === null ? '-' : formatAngkaTeks_(Math.round(lap.margin * 1000) / 10) + '%')]);
  baris(['Rata-rata per transaksi', lap.rataRata]);
  baris(['Transaksi batal', lap.batal.jumlah, lap.batal.total]);
  bagian('PER HARI');
  baris(['Tanggal', 'Transaksi', 'Penjualan', 'Laba kotor']);
  // Tanggal sebagai teks: tanpa apostrof Sheets mengubahnya menjadi nilai tanggal.
  lap.perHari.forEach(function (h) { baris([teks(h.tanggal), h.jumlah, h.omzet, h.laba]); });
  bagian('PER METODE BAYAR');
  baris(['Metode', 'Transaksi', 'Total']);
  lap.perMetode.forEach(function (m) { baris([m.metode, m.jumlah, m.total]); });
  bagian('ARUS KAS');
  baris(['Jenis', 'Kategori', 'Jumlah catatan', 'Total']);
  lap.kas.perKategori.forEach(function (k) { baris([k.jenis, k.kategori, k.jumlah, k.total]); });
  bagian('PER KASIR');
  baris(['Kasir', 'Transaksi', 'Total']);
  lap.perKasir.forEach(function (k) { baris([teks(k.nama), k.jumlah, k.total]); });
  bagian('PRODUK TERLARIS');
  baris(['Item', 'Qty', 'Omzet', 'Laba kotor']);
  lap.terlaris.forEach(function (t) { baris([teks(t.nama), t.qty, t.omzet, t.laba]); });

  const sh = ss.insertSheet(nama, ss.getSheets().length);
  sh.getRange(1, 1, rows.length, L).setValues(rows);
  sh.getRange(1, 2, rows.length, L - 1).setNumberFormat('#,##0.###');
  sh.getRangeList(judul.map(function (n) { return 'A' + n; })).setFontWeight('bold');
  sh.setColumnWidth(1, 220);
  SpreadsheetApp.flush();
  return { nama: nama, url: ss.getUrl() + '#gid=' + sh.getSheetId() };
}
