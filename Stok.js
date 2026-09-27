/**
 * Stok.js — stok masuk, opname, riwayat stok (Stok_Log), stok menipis. Semua khusus Admin.
 * Stok berjalan disimpan di Item.Stok; Stok_Log hanya jejak audit.
 */

function stokMasuk(token, data) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    return prosesStokMasuk_(sesi, normalisasiStokMasuk_(data));
  });
}

function opname(token, baris, ket) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    return prosesOpname_(sesi, baris, teksBersih_(ket, 200, 'Keterangan'));
  });
}

function listStokLog(token, filter) {
  return jalankan_(token, ROLE.ADMIN, function () {
    return cariStokLog_(filter || {});
  });
}

function listStokMenipis(token) {
  return jalankan_(token, ROLE.ADMIN, function () {
    return daftarItemCache_()
      .filter(stokMenipis_)
      .sort(function (a, b) { return (a.stok - a.stokMin) - (b.stok - b.stokMin); })
      .map(function (i) { return itemUntukKlien_(i, true); });
  });
}

// ---------- Internal ----------

function prosesStokMasuk_(sesi, d) {
  return denganKunci_(function () {
    const it = bacaItem_();
    const item = it.peta[d.idItem];
    if (!item) throw galat_('TIDAK_ADA', 'Item tidak ditemukan.');
    if (item.tipe === 'Menu') throw galat_('VALIDASI', 'Menu tidak punya stok sendiri. Tambahkan stok bahannya.');
    const t = it.tabel;
    const sekarang = new Date();
    const sesudah = bulatQty_(item.stok + d.qty);
    tulisSel_(t, item.idx, 'Stok', sesudah);
    tambahObjek_(bacaHeader_(SHEET.STOK_LOG), [{
      Tanggal: sekarang, 'ID Item': item.id, Nama: amanSel_(item.nama), Jenis: 'Masuk', Qty: d.qty,
      'Stok Sesudah': sesudah, Ref: amanSel_(d.ref), 'Kasir/User': sesi.u, Keterangan: amanSel_(d.ket),
    }]);

    // Harga beli baru (opsional) ikut memperbarui HPP menu yang memakai item ini.
    const logHarga = [];
    if (d.hargaBeli !== null && d.hargaBeli !== item.hargaBeli) {
      logHarga.push({ id: item.id, hbLama: item.hargaBeli, hbBaru: d.hargaBeli, hjLama: item.hargaJual, hjBaru: item.hargaJual });
      item.hargaBeli = d.hargaBeli;
      t.baris[item.idx][t.kol['Harga Beli']] = d.hargaBeli;
      if (!terapkanHppMenu_(it, bacaResep_().peta, logHarga)) tulisSel_(t, item.idx, 'Harga Beli', d.hargaBeli);
      catatHarga_(logHarga, sekarang, sesi.u);
    }
    naikkanVersi_('item');
    return { idItem: item.id, nama: item.nama, stok: sesudah, hargaBeli: item.hargaBeli, hppMenuBerubah: Math.max(0, logHarga.length - 1) };
  });
}

function prosesOpname_(sesi, baris, ket) {
  return denganKunci_(function () {
    const it = bacaItem_();
    const hasil = hitungOpname_(baris, it.peta);
    const t = it.tabel;
    const kolStok = t.kol.Stok;
    const sekarang = new Date();
    const log = [];
    hasil.forEach(function (h) {
      if (h.selisih === 0) return;
      t.baris[it.peta[h.idItem].idx][kolStok] = h.stokFisik;
      log.push({
        Tanggal: sekarang, 'ID Item': h.idItem, Nama: amanSel_(h.nama), Jenis: 'Opname', Qty: h.selisih,
        'Stok Sesudah': h.stokFisik, Ref: '', 'Kasir/User': sesi.u,
        Keterangan: amanSel_('Stok sistem ' + formatAngkaTeks_(h.stokLama) + (ket ? '; ' + ket : '')),
      });
    });
    if (log.length) {
      tulisKolom_(t, 'Stok', t.baris.map(function (r) { return r[kolStok]; }));
      tambahObjek_(bacaHeader_(SHEET.STOK_LOG), log);
      naikkanVersi_('item');
    }
    return hasil;
  });
}

function cariStokLog_(f) {
  const tz = zonaWaktu_(bacaPengaturan_());
  const hariIni = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const rentang = rentangTanggal_(f.dari, f.sampai, hariIni);
  const idItem = f.idItem ? String(f.idItem) : '';
  const jenis = f.jenis ? String(f.jenis) : '';
  if (jenis && JENIS_STOK.indexOf(jenis) === -1) throw galat_('VALIDASI', 'Jenis stok tidak dikenal.');
  const batas = Math.min(Math.max(Number(f.limit) || 200, 1), 500);

  const hasil = [];
  telusuriMundur_(SHEET.STOK_LOG, function (r, i, t) {
    const tgl = r[t.kol.Tanggal];
    const hari = tgl instanceof Date ? Utilities.formatDate(tgl, tz, 'yyyy-MM-dd') : '';
    if (hari && hari < rentang.dari) return false; // log kronologis: sudah lewat rentang
    if (!hari || hari > rentang.sampai) return true;
    if (idItem && String(r[t.kol['ID Item']]) !== idItem) return true;
    if (jenis && r[t.kol.Jenis] !== jenis) return true;
    hasil.push({
      tanggal: formatWaktu_(tgl, tz), idItem: String(r[t.kol['ID Item']]), nama: String(r[t.kol.Nama]),
      jenis: String(r[t.kol.Jenis]), qty: angka_(r[t.kol.Qty]), stokSesudah: angka_(r[t.kol['Stok Sesudah']]),
      ref: String(r[t.kol.Ref]), user: String(r[t.kol['Kasir/User']]), ket: String(r[t.kol.Keterangan]),
    });
    return hasil.length < batas;
  });
  return { baris: hasil, penuh: hasil.length >= batas, rentang: rentang };
}
