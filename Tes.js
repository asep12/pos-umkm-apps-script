/**
 * Tes.js — uji fungsi murni di Logika.js. Tidak menulis ke sheet.
 * Jalankan "jalankanTes" dari editor Apps Script atau menu POS > Jalankan Tes Logika.
 */

function jalankanTes() {
  const hasil = { lulus: 0, gagal: [] };
  const kasus = daftarKasusTes_();
  Object.keys(kasus).forEach(function (nama) {
    try {
      kasus[nama]();
      hasil.lulus++;
      console.log('✔ ' + nama);
    } catch (e) {
      hasil.gagal.push(nama + ': ' + e.message);
      console.log('✘ ' + nama + ' — ' + e.message);
    }
  });
  const ringkas = hasil.lulus + ' lulus, ' + hasil.gagal.length + ' gagal' +
    (hasil.gagal.length ? '\n\n' + hasil.gagal.join('\n') : '');
  console.log(ringkas);
  try {
    SpreadsheetApp.getUi().alert('Tes Logika POS', ringkas, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // Dijalankan dari editor: hasil cukup di log eksekusi.
  }
  return ringkas;
}

function samaDengan_(aktual, harapan, pesan) {
  const a = JSON.stringify(aktual);
  const h = JSON.stringify(harapan);
  if (a !== h) throw new Error((pesan || 'tidak sama') + ' — dapat ' + a + ', harap ' + h);
}

function harusGalat_(fn, kode) {
  try {
    fn();
  } catch (e) {
    if (kode && e.kode !== kode) throw new Error('kode galat ' + e.kode + ', harap ' + kode);
    return e;
  }
  throw new Error('seharusnya melempar galat ' + (kode || ''));
}

function dataUjiItem_() {
  const daftar = [
    { id: 'ITM-0001', nama: 'Gula Pasir', tipe: 'Barang', satuan: 'kg', hargaBeli: 14000, hargaJual: 16000, stok: 10, lacak: true, aktif: true },
    { id: 'ITM-0002', nama: 'Kopi Bubuk', tipe: 'Bahan', satuan: 'gram', hargaBeli: 150, hargaJual: 0, stok: 100, lacak: true, aktif: true },
    { id: 'ITM-0003', nama: 'Gula Bahan', tipe: 'Bahan', satuan: 'gram', hargaBeli: 15, hargaJual: 0, stok: 50, lacak: true, aktif: true },
    { id: 'ITM-0004', nama: 'Kopi Hitam', tipe: 'Menu', satuan: 'gelas', hargaBeli: 2400, hargaJual: 8000, stok: 0, lacak: true, aktif: true },
    { id: 'ITM-0005', nama: 'Kopi Manis', tipe: 'Menu', satuan: 'gelas', hargaBeli: 2550, hargaJual: 9000, stok: 0, lacak: true, aktif: true },
    { id: 'ITM-0006', nama: 'Nasi Goreng', tipe: 'Menu', satuan: 'porsi', hargaBeli: 9000, hargaJual: 15000, stok: 0, lacak: false, aktif: true },
    { id: 'ITM-0007', nama: 'Barang Lama', tipe: 'Barang', satuan: 'pcs', hargaBeli: 1000, hargaJual: 2000, stok: 5, lacak: true, aktif: false },
  ];
  const peta = {};
  daftar.forEach(function (i) { peta[i.id] = i; });
  const resep = {
    'ITM-0004': [{ idBahan: 'ITM-0002', qty: 16 }],
    'ITM-0005': [{ idBahan: 'ITM-0002', qty: 16 }, { idBahan: 'ITM-0003', qty: 10 }],
  };
  return { peta: peta, resep: resep };
}

function daftarKasusTes_() {
  return {
    'bulatUang_ membulatkan ke rupiah': function () {
      samaDengan_(bulatUang_(1500.5), 1501);
      samaDengan_(bulatUang_('abc'), 0);
    },
    'bulatQty_ menghindari galat desimal': function () {
      samaDengan_(bulatQty_(0.1 + 0.2), 0.3);
      samaDengan_(bulatQty_(1.23456), 1.235);
    },
    'margin_ dihitung dari harga jual': function () {
      samaDengan_(margin_(10000, 7500), 0.25);
      samaDengan_(margin_(0, 100), null);
    },
    'pinLemah_ mengenali pola lemah': function () {
      samaDengan_(pinLemah_('0000'), true);
      samaDengan_(pinLemah_('123456'), true);
      samaDengan_(pinLemah_('654321'), true);
      samaDengan_(pinLemah_('481937'), false);
      samaDengan_(validPin_('12a4'), false);
      samaDengan_(validPin_('1234567'), false);
    },
    'idItemBerikut_ melanjutkan nomor terbesar': function () {
      samaDengan_(idItemBerikut_([]), 'ITM-0001');
      samaDengan_(idItemBerikut_(['ITM-0009', 'ITM-0002', 'lain']), 'ITM-0010');
      samaDengan_(idItemBerikut_(['ITM-9999']), 'ITM-10000');
    },
    'normalisasiItem_ menolak data salah': function () {
      harusGalat_(function () { normalisasiItem_({ tipe: 'Barang', nama: '', hargaJual: 1000 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiItem_({ tipe: 'Jasa', nama: 'X', hargaJual: 1000 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiItem_({ tipe: 'Barang', nama: 'X', hargaJual: -5 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiItem_({ tipe: 'Barang', nama: 'X', hargaJual: 1000, foto: 'javascript:alert(1)' }); }, 'VALIDASI');
      const bahan = normalisasiItem_({ tipe: 'Bahan', nama: ' Kopi ', hargaJual: 5000, stokAwal: '2.5' });
      samaDengan_([bahan.nama, bahan.hargaJual, bahan.stokAwal, bahan.satuan], ['Kopi', 0, 2.5, 'pcs']);
      const menu = normalisasiItem_({ tipe: 'Menu', nama: 'Es Teh', hargaJual: 5000, stokAwal: 9 });
      samaDengan_(menu.stokAwal, 0, 'stok menu diabaikan');
    },
    'hitungHppMenu_ menjumlahkan bahan': function () {
      const d = dataUjiItem_();
      samaDengan_(hitungHppMenu_(d.resep['ITM-0005'], d.peta), 2550);
    },
    'hppMenuBerubah_ hanya melaporkan yang berubah': function () {
      const d = dataUjiItem_();
      d.peta['ITM-0002'].hargaBeli = 200;
      samaDengan_(hppMenuBerubah_(d.peta, d.resep), [
        { id: 'ITM-0004', lama: 2400, baru: 3200 },
        { id: 'ITM-0005', lama: 2550, baru: 3350 },
      ]);
    },
    'normalisasiResep_ memvalidasi bahan': function () {
      const d = dataUjiItem_();
      samaDengan_(normalisasiResep_('ITM-0004', [{ idBahan: 'ITM-0002', qty: '15.5' }], d.peta), [{ idBahan: 'ITM-0002', qty: 15.5 }]);
      harusGalat_(function () { normalisasiResep_('ITM-0001', [], d.peta); }, 'VALIDASI');
      harusGalat_(function () { normalisasiResep_('ITM-0004', [{ idBahan: 'ITM-0005', qty: 1 }], d.peta); }, 'VALIDASI');
      harusGalat_(function () {
        normalisasiResep_('ITM-0004', [{ idBahan: 'ITM-0002', qty: 1 }, { idBahan: 'ITM-0002', qty: 2 }], d.peta);
      }, 'VALIDASI');
      harusGalat_(function () { normalisasiResep_('ITM-0004', [{ idBahan: 'ITM-0002', qty: 0 }], d.peta); }, 'VALIDASI');
    },
    'normalisasiTransaksi_ menggabungkan item sama': function () {
      const t = normalisasiTransaksi_({
        items: [{ idItem: 'A', qty: 1 }, { idItem: 'B', qty: 2 }, { idItem: 'A', qty: 0.5 }],
        metode: 'Tunai', bayar: 10000,
      });
      samaDengan_(t.items, [{ idItem: 'A', qty: 1.5 }, { idItem: 'B', qty: 2 }]);
      harusGalat_(function () { normalisasiTransaksi_({ items: [], metode: 'Tunai' }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiTransaksi_({ items: [{ idItem: 'A', qty: -1 }], metode: 'Tunai', bayar: 0 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiTransaksi_({ items: [{ idItem: 'A', qty: 1 }], metode: 'Bitcoin' }); }, 'VALIDASI');
      harusGalat_(function () {
        normalisasiTransaksi_({ items: [{ idItem: 'A', qty: 1 }], metode: 'QRIS', diskon: { jenis: 'persen', nilai: 150 } });
      }, 'VALIDASI');
    },
    'hitungTransaksi_ memakai harga dari sheet, diskon, pajak, kembalian': function () {
      const d = dataUjiItem_();
      const trx = normalisasiTransaksi_({
        items: [{ idItem: 'ITM-0001', qty: 2, harga: 1 }, { idItem: 'ITM-0004', qty: 1 }],
        diskon: { jenis: 'persen', nilai: 10 }, metode: 'Tunai', bayar: 50000,
      });
      const h = hitungTransaksi_(trx, d.peta, 11);
      // subtotal 40.000, diskon 4.000, pajak 11% x 36.000 = 3.960, total 39.960
      samaDengan_([h.subtotal, h.diskon, h.pajak, h.total, h.bayar, h.kembalian], [40000, 4000, 3960, 39960, 50000, 10040]);
      samaDengan_(h.baris[0].harga, 16000, 'harga klien diabaikan');
      samaDengan_(h.baris[1].hppSatuan, 2400);
    },
    'hitungTransaksi_ non-tunai: bayar = total': function () {
      const d = dataUjiItem_();
      const trx = normalisasiTransaksi_({ items: [{ idItem: 'ITM-0001', qty: 1 }], metode: 'QRIS', bayar: 999999 });
      const h = hitungTransaksi_(trx, d.peta, 0);
      samaDengan_([h.total, h.bayar, h.kembalian], [16000, 16000, 0]);
    },
    'hitungTransaksi_ menolak bayar kurang, item nonaktif, bahan, diskon berlebih': function () {
      const d = dataUjiItem_();
      function trx(items, extra) {
        return normalisasiTransaksi_(Object.assign({ items: items, metode: 'Tunai', bayar: 100000 }, extra || {}));
      }
      harusGalat_(function () { hitungTransaksi_(trx([{ idItem: 'ITM-0001', qty: 1 }], { bayar: 1000 }), d.peta, 0); }, 'VALIDASI');
      harusGalat_(function () { hitungTransaksi_(trx([{ idItem: 'ITM-0007', qty: 1 }]), d.peta, 0); }, 'VALIDASI');
      harusGalat_(function () { hitungTransaksi_(trx([{ idItem: 'ITM-0002', qty: 1 }]), d.peta, 0); }, 'VALIDASI');
      harusGalat_(function () { hitungTransaksi_(trx([{ idItem: 'ITM-9999', qty: 1 }]), d.peta, 0); }, 'TIDAK_ADA');
      harusGalat_(function () {
        hitungTransaksi_(trx([{ idItem: 'ITM-0001', qty: 1 }], { diskon: { nilai: 20000 } }), d.peta, 0);
      }, 'VALIDASI');
    },
    'hitungKebutuhanStok_ menggabungkan bahan dari beberapa menu': function () {
      const d = dataUjiItem_();
      const baris = [
        { idItem: 'ITM-0001', qty: 1.5 },
        { idItem: 'ITM-0004', qty: 2 },
        { idItem: 'ITM-0005', qty: 1 },
        { idItem: 'ITM-0006', qty: 3 },
      ];
      samaDengan_(hitungKebutuhanStok_(baris, d.peta, d.resep), { 'ITM-0001': 1.5, 'ITM-0002': 48, 'ITM-0003': 10 });
    },
    'hitungKebutuhanStok_ mengabaikan item/bahan yang tidak dilacak': function () {
      const d = dataUjiItem_();
      d.peta['ITM-0003'].lacak = false;
      samaDengan_(hitungKebutuhanStok_([{ idItem: 'ITM-0005', qty: 1 }], d.peta, d.resep), { 'ITM-0002': 16 });
      d.peta['ITM-0005'].lacak = false;
      samaDengan_(hitungKebutuhanStok_([{ idItem: 'ITM-0005', qty: 1 }], d.peta, d.resep), {});
    },
    'cekStok_ menyebut item yang kurang': function () {
      const d = dataUjiItem_();
      const kurang = cekStok_({ 'ITM-0002': 112, 'ITM-0001': 3 }, d.peta, false);
      samaDengan_(kurang.map(function (k) { return k.nama; }), ['Kopi Bubuk']);
      samaDengan_(cekStok_({ 'ITM-0002': 112 }, d.peta, true), [], 'izinkan minus');
      const pesan = pesanStokKurang_(kurang);
      if (pesan.indexOf('Kopi Bubuk (butuh 112 gram, tersedia 100)') === -1) throw new Error('pesan: ' + pesan);
    },
    'nomor nota berurutan dan reset harian': function () {
      samaDengan_(urutNotaBerikut_(null, '260927'), 1);
      samaDengan_(urutNotaBerikut_('260927|41', '260927'), 42);
      samaDengan_(urutNotaBerikut_('260926|41', '260927'), 1);
      samaDengan_(formatNomorNota_('INV', '260927', 42), 'INV-260927-0042');
    },
    'normalisasiStokMasuk_ memvalidasi qty & harga opsional': function () {
      const a = normalisasiStokMasuk_({ idItem: 'ITM-0001', qty: '2.5', hargaBeli: '', ket: ' datang ' });
      samaDengan_([a.qty, a.hargaBeli, a.ket], [2.5, null, 'datang']);
      samaDengan_(normalisasiStokMasuk_({ idItem: 'X', qty: 1, hargaBeli: '1500.4' }).hargaBeli, 1500);
      harusGalat_(function () { normalisasiStokMasuk_({ idItem: 'X', qty: 0 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiStokMasuk_({ idItem: '', qty: 1 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiStokMasuk_({ idItem: 'X', qty: 1, hargaBeli: -1 }); }, 'VALIDASI');
    },
    'hitungOpname_ menghitung selisih & menolak menu/duplikat': function () {
      const d = dataUjiItem_();
      samaDengan_(hitungOpname_([{ idItem: 'ITM-0001', stokFisik: 8.5 }, { idItem: 'ITM-0002', stokFisik: '100' }], d.peta)
        .map(function (o) { return o.selisih; }), [-1.5, 0]);
      harusGalat_(function () { hitungOpname_([], d.peta); }, 'VALIDASI');
      harusGalat_(function () { hitungOpname_([{ idItem: 'ITM-0004', stokFisik: 1 }], d.peta); }, 'VALIDASI');
      harusGalat_(function () { hitungOpname_([{ idItem: 'ITM-0001', stokFisik: -1 }], d.peta); }, 'VALIDASI');
      harusGalat_(function () {
        hitungOpname_([{ idItem: 'ITM-0001', stokFisik: 1 }, { idItem: 'ITM-0001', stokFisik: 2 }], d.peta);
      }, 'VALIDASI');
    },
    'rentangTanggal_ default hari ini & validasi': function () {
      samaDengan_(rentangTanggal_('', '', '2026-09-27'), { dari: '2026-09-27', sampai: '2026-09-27' });
      samaDengan_(rentangTanggal_('2026-09-01', '', '2026-09-27'), { dari: '2026-09-01', sampai: '2026-09-27' });
      harusGalat_(function () { rentangTanggal_('2026-02-30', '', '2026-09-27'); }, 'VALIDASI');
      harusGalat_(function () { rentangTanggal_('2026-09-10', '2026-09-01', '2026-09-27'); }, 'VALIDASI');
    },
    'normalisasiPengaturan_ memetakan & memvalidasi': function () {
      const dasar = { nama: 'Warung', mode: 'Retail', zonaWaktu: 'Asia/Jakarta', lebarStruk: '80', prefixNota: 'inv', pajakPersen: '11', izinkanStokMinus: true };
      const o = normalisasiPengaturan_(dasar);
      samaDengan_([o.NAMA_USAHA, o.LEBAR_STRUK, o.PREFIX_NOTA, o.PAJAK_PERSEN, o.IZINKAN_STOK_MINUS], ['Warung', 80, 'INV', 11, 'Ya']);
      harusGalat_(function () { normalisasiPengaturan_(Object.assign({}, dasar, { nama: '' })); }, 'VALIDASI');
      harusGalat_(function () { normalisasiPengaturan_(Object.assign({}, dasar, { prefixNota: 'IN V' })); }, 'VALIDASI');
      harusGalat_(function () { normalisasiPengaturan_(Object.assign({}, dasar, { zonaWaktu: 'Europe/Paris' })); }, 'VALIDASI');
      harusGalat_(function () { normalisasiPengaturan_(Object.assign({}, dasar, { pajakPersen: 150 })); }, 'VALIDASI');
    },
    'normalisasiPengguna_ & adaAdminAktif_': function () {
      samaDengan_(normalisasiPengguna_({ username: ' Budi.K ', nama: 'Budi', role: 'Kasir' }).username, 'budi.k');
      harusGalat_(function () { normalisasiPengguna_({ username: 'a b', nama: 'X', role: 'Kasir' }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiPengguna_({ username: 'budi', nama: 'X', role: 'Bos' }); }, 'VALIDASI');
      samaDengan_(adaAdminAktif_([{ role: 'Admin', aktif: false }, { role: 'Kasir', aktif: true }]), false);
      samaDengan_(adaAdminAktif_([{ role: 'Admin', aktif: true }]), true);
    },
    'geserHari_ & daftarHari_ melewati akhir bulan/tahun': function () {
      samaDengan_(geserHari_('2026-12-31', 1), '2027-01-01');
      samaDengan_(geserHari_('2026-03-01', -1), '2026-02-28');
      samaDengan_(daftarHari_('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
      harusGalat_(function () { rentangLaporan_('2025-01-01', '2026-09-27', '2026-09-27'); }, 'VALIDASI');
    },
    'ringkasPenjualan_: laba kotor, batal, per hari/metode/kasir/jam, terlaris': function () {
      const trx = [
        { noNota: 'A', hari: '2026-09-26', jam: 9, kasir: 'budi', metode: 'Tunai', status: 'Lunas', subtotal: 20000, diskon: 2000, pajak: 1800, total: 19800 },
        { noNota: 'B', hari: '2026-09-27', jam: 9, kasir: 'siti', metode: 'QRIS', status: 'Lunas', subtotal: 10000, diskon: 0, pajak: 0, total: 10000 },
        { noNota: 'C', hari: '2026-09-27', jam: 14, kasir: 'budi', metode: 'Tunai', status: 'Batal', subtotal: 5000, diskon: 0, pajak: 0, total: 5000 },
      ];
      const detail = [
        { noNota: 'A', idItem: 'I1', nama: 'Kopi', qty: 2, subtotal: 16000, hpp: 3000 },
        { noNota: 'A', idItem: 'I2', nama: 'Roti', qty: 1, subtotal: 4000, hpp: 2500 },
        { noNota: 'B', idItem: 'I1', nama: 'Kopi', qty: 1, subtotal: 8000, hpp: 3000 },
        { noNota: 'B', idItem: 'I2', nama: 'Roti', qty: 0.5, subtotal: 2000, hpp: 2500 },
        { noNota: 'C', idItem: 'I2', nama: 'Roti', qty: 10, subtotal: 5000, hpp: 2500 },
      ];
      const r = ringkasPenjualan_(trx, detail, { dari: '2026-09-26', sampai: '2026-09-27' });
      // A: bersih 18.000 − HPP 8.500 = 9.500; B: 10.000 − HPP 4.250 = 5.750
      samaDengan_([r.jumlah, r.omzet, r.penjualanBersih, r.hpp, r.labaKotor, r.pajak], [2, 29800, 28000, 12750, 15250, 1800]);
      samaDengan_(r.batal, { jumlah: 1, total: 5000 });
      samaDengan_(r.rataRata, 14900);
      samaDengan_(r.margin, 0.545);
      samaDengan_(r.perHari.map(function (h) { return [h.tanggal, h.jumlah, h.omzet, h.laba]; }),
        [['2026-09-26', 1, 19800, 9500], ['2026-09-27', 1, 10000, 5750]]);
      samaDengan_(r.perMetode.map(function (m) { return [m.metode, m.jumlah]; }), [['Tunai', 1], ['QRIS', 1], ['Transfer', 0]]);
      samaDengan_(r.perKasir.map(function (k) { return k.kasir; }), ['budi', 'siti']);
      samaDengan_([r.perJam[9].jumlah, r.perJam[14].jumlah], [2, 0]);
      samaDengan_(r.terlaris.map(function (t) { return [t.idItem, t.qty, t.omzet]; }), [['I1', 3, 24000], ['I2', 1.5, 6000]]);
    },
    'ringkasPenjualan_ rentang kosong tetap punya semua hari': function () {
      const r = ringkasPenjualan_([], [], { dari: '2026-09-21', sampai: '2026-09-27' });
      samaDengan_([r.jumlah, r.margin, r.rataRata, r.perHari.length, r.terlaris.length], [0, null, 0, 7, 0]);
    },
    'normalisasiKas_ memvalidasi jenis, kategori, jumlah': function () {
      const k = normalisasiKas_({ jenis: 'Keluar', kategori: 'Operasional', jumlah: '15000.4', keterangan: ' listrik ' });
      samaDengan_([k.jumlah, k.keterangan], [15000, 'listrik']);
      harusGalat_(function () { normalisasiKas_({ jenis: 'Pinjam', kategori: 'Lainnya', jumlah: 1 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiKas_({ jenis: 'Masuk', kategori: 'Gaji', jumlah: 1 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiKas_({ jenis: 'Keluar', kategori: 'Gaji', jumlah: 0 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiKas_({ jenis: 'Keluar', kategori: 'Lainnya', jumlah: 5000 }); }, 'VALIDASI');
    },
    'hitungPecahan_ menjumlah lembar & menolak pecahan asing': function () {
      samaDengan_(hitungPecahan_({ 100000: 2, 50000: 1, 2000: 3, 500: 4 }), 258000);
      harusGalat_(function () { hitungPecahan_({ 75000: 1 }); }, 'VALIDASI');
      harusGalat_(function () { hitungPecahan_({ 1000: 1.5 }); }, 'VALIDASI');
    },
    'rekapShift_: uang seharusnya di laci': function () {
      const r = rekapShift_(200000,
        [{ metode: 'Tunai', status: 'Lunas', total: 50000 }, { metode: 'QRIS', status: 'Lunas', total: 30000 },
          { metode: 'Tunai', status: 'Batal', total: 99000 }],
        [{ jenis: 'Keluar', jumlah: 15000 }, { jenis: 'Masuk', jumlah: 5000 }]);
      samaDengan_([r.jumlahTrx, r.batal, r.penjualanTunai, r.penjualanNonTunai, r.kasMasuk, r.kasKeluar, r.kasSeharusnya],
        [2, 1, 50000, 30000, 5000, 15000, 240000]);
    },
    'ringkasKas_: biaya tidak termasuk belanja stok & setoran': function () {
      const r = ringkasKas_([
        { jenis: 'Keluar', kategori: 'Belanja stok', jumlah: 100000 },
        { jenis: 'Keluar', kategori: 'Operasional', jumlah: 20000 },
        { jenis: 'Keluar', kategori: 'Setoran ke pemilik', jumlah: 300000 },
        { jenis: 'Masuk', kategori: 'Pendapatan lain', jumlah: 7000 },
        { jenis: 'Masuk', kategori: 'Tambahan modal', jumlah: 50000 },
      ]);
      samaDengan_([r.masuk, r.keluar, r.biaya, r.pendapatanLain], [57000, 420000, 20000, 7000]);
      samaDengan_(r.perKategori[0].kategori, 'Setoran ke pemilik');
    },
    'ean13_ menghitung checksum GS1': function () {
      samaDengan_(ean13_('400638133393'), '4006381333931'); // contoh resmi GS1
      samaDengan_(ean13_('200000000001'), '2000000000015');
      harusGalat_(function () { ean13_('12345'); }, 'VALIDASI');
    },
    'strukTeks_: setiap baris tepat/kurang dari lebar kolom, isi lengkap': function () {
      const nota = {
        noNota: 'INV-260927-0001', tanggal: '2026-09-27 14:05', kasir: 'Siti', status: 'Lunas',
        items: [{ nama: 'Es Kopi Susu Gula Aren Ukuran Besar Sekali', qty: 2, harga: 18000, subtotal: 36000 }],
        subtotal: 36000, diskon: 1000, pajak: 0, total: 35000, metode: 'Tunai', bayar: 50000, kembalian: 15000,
        toko: { nama: 'Toko Contoh', alamat: 'Jl. Melati No. 5, Kecamatan Contoh, Kota Contoh', telepon: '0812', footer: 'Terima kasih' },
      };
      [32, 48].forEach(function (k) {
        const b = strukTeks_(nota, k);
        b.forEach(function (x) { if (x.length > k) throw new Error('baris ' + x.length + ' > ' + k + ': ' + x); });
        const semua = b.join('\n');
        ['INV-260927-0001', 'TOTAL', 'Rp 35.000', 'Kembalian', '15.000', 'Diskon', 'Terima kasih'].forEach(function (s) {
          if (semua.indexOf(s) === -1) throw new Error('tidak ada "' + s + '" (kolom ' + k + ')');
        });
      });
      samaDengan_(kiriKananTeks_('TOTAL', 'Rp 35.000', 20), 'TOTAL      Rp 35.000');
      samaDengan_(bungkusTeks_('Es Kopi Susu Gula Aren', 10), ['Es Kopi', 'Susu Gula', 'Aren']);
      samaDengan_(kolomStruk_(80), 48);
    },
    'hitungHargaMassal_: persen, nominal, pembulatan, filter': function () {
      const items = [
        { id: 'A', nama: 'Gula', tipe: 'Barang', kategori: 'Sembako', hargaJual: 17000, aktif: true },
        { id: 'B', nama: 'Kopi', tipe: 'Menu', kategori: 'Minuman', hargaJual: 8000, aktif: true },
        { id: 'C', nama: 'Bahan', tipe: 'Bahan', kategori: 'Sembako', hargaJual: 0, aktif: true },
        { id: 'D', nama: 'Lama', tipe: 'Barang', kategori: 'Sembako', hargaJual: 5000, aktif: false },
      ];
      const naik = hitungHargaMassal_(items, normalisasiHargaMassal_({ mode: 'persen', nilai: 10, bulat: 500 }));
      samaDengan_(naik.map(function (x) { return [x.id, x.baru]; }), [['A', 19000], ['B', 9000]]);
      const sembako = hitungHargaMassal_(items, normalisasiHargaMassal_({ mode: 'nominal', nilai: -500, kategori: 'Sembako' }));
      samaDengan_(sembako.map(function (x) { return [x.id, x.baru]; }), [['A', 16500]]);
      samaDengan_(hitungHargaMassal_(items, normalisasiHargaMassal_({ mode: 'nominal', nilai: 1000, tipe: 'Menu' })).length, 1);
      harusGalat_(function () { hitungHargaMassal_(items, normalisasiHargaMassal_({ mode: 'nominal', nilai: -9000 })); }, 'VALIDASI');
      harusGalat_(function () { normalisasiHargaMassal_({ mode: 'persen', nilai: 0 }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiHargaMassal_({ mode: 'persen', nilai: 5, bulat: 250 }); }, 'VALIDASI');
    },
    'normalisasiBill_: nama wajib, item digabung': function () {
      const b = normalisasiBill_({ nama: ' Meja 3 ', items: [{ idItem: 'X', qty: 1 }, { idItem: 'X', qty: 2 }] });
      samaDengan_([b.nama, b.items], ['Meja 3', [{ idItem: 'X', qty: 3 }]]);
      harusGalat_(function () { normalisasiBill_({ nama: '', items: [{ idItem: 'X', qty: 1 }] }); }, 'VALIDASI');
      harusGalat_(function () { normalisasiBill_({ nama: 'M1', items: [] }); }, 'VALIDASI');
    },
    'angkaIndonesia_ membaca format Excel Indonesia': function () {
      samaDengan_([angkaIndonesia_('17.000'), angkaIndonesia_('Rp 17.000'), angkaIndonesia_('1,5'), angkaIndonesia_('1.000,25'), angkaIndonesia_('2.5'), angkaIndonesia_(12)],
        [17000, 17000, 1.5, 1000.25, 2.5, 12]);
      samaDengan_(isNaN(angkaIndonesia_('abc')), true);
    },
    'parseTabelTeks_: tab (tempel Excel), titik koma, koma berkutip': function () {
      const tab = parseTabelTeks_('Nama\tHarga Jual\nGula\t17.000\n\nKopi\t8000\n');
      samaDengan_([tab.pemisah, tab.header, tab.baris], ['\t', ['Nama', 'Harga Jual'], [['Gula', '17.000'], ['Kopi', '8000']]]);
      samaDengan_(parseTabelTeks_('﻿Nama;Harga\r\nMinyak 1 L;18.000\r\n').baris, [['Minyak 1 L', '18.000']]);
      samaDengan_(parseTabelTeks_('Nama,Harga\n"Teh ""Wangi"", 250 g",5000').baris, [['Teh "Wangi", 250 g', '5000']]);
    },
    'petaKolomImpor_ & barisImporKeItem_': function () {
      const peta = petaKolomImpor_(['Nama Barang', 'HPP', 'Harga', 'Stok', 'Barcode', 'jenis']);
      samaDengan_([peta.nama, peta.hargaBeli, peta.hargaJual, peta.stokAwal, peta.kode, peta.tipe], [0, 1, 2, 3, 4, 5]);
      const item = barisImporKeItem_(['Gula', '14.500', '17.000', '1,5', '00123', 'barang'], peta);
      samaDengan_([item.tipe, item.hargaBeli, item.hargaJual, item.stokAwal, item.kode, item.lacak], ['Barang', 14500, 17000, 1.5, '00123', true]);
      harusGalat_(function () { barisImporKeItem_(['X', 'mahal', '1', '', '', ''], peta); }, 'VALIDASI');
      harusGalat_(function () { petaKolomImpor_(['Harga', 'Stok']); }, 'VALIDASI');
    },
    'hitungPersediaan_: stok × harga beli per kategori': function () {
      const r = hitungPersediaan_([
        { aktif: true, lacak: true, tipe: 'Barang', kategori: 'Sembako', stok: 10, hargaBeli: 14500 },
        { aktif: true, lacak: true, tipe: 'Bahan', kategori: 'Bahan', stok: 1000, hargaBeli: 150 },
        { aktif: true, lacak: true, tipe: 'Menu', kategori: 'Minuman', stok: 5, hargaBeli: 3000 },
        { aktif: false, lacak: true, tipe: 'Barang', kategori: 'Sembako', stok: 5, hargaBeli: 1000 },
        { aktif: true, lacak: true, tipe: 'Barang', kategori: 'Sembako', stok: -2, hargaBeli: 1000 },
      ]);
      samaDengan_([r.nilai, r.jumlahItem, r.perKategori.map(function (k) { return k.kategori; })], [295000, 2, ['Bahan', 'Sembako']]);
    },
    'ean13Bits_: 95 modul, pola penjaga, tolak digit cek salah': function () {
      const b = ean13Bits_('4006381333931');
      samaDengan_([b.length, b.slice(0, 3), b.slice(45, 50), b.slice(-3)], [95, '101', '01010', '101']);
      // Digit pertama 4 -> paritas LGLLGG: digit ke-2 ("0") memakai kode L "0001101".
      samaDengan_(b.slice(3, 10), '0001101');
      harusGalat_(function () { ean13Bits_('4006381333932'); }, 'VALIDASI');
      samaDengan_(kodeDariIdItem_('ITM-0057'), ean13_('200000000057'));
      samaDengan_(kodeDariIdItem_('X-1'), '');
    },
    'format teks angka Indonesia': function () {
      samaDengan_(formatRupiahTeks_(1234567), 'Rp 1.234.567');
      samaDengan_(formatAngkaTeks_(1.5), '1,5');
      samaDengan_(formatAngkaTeks_(-2500), '-2.500');
    },
  };
}
