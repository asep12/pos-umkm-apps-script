/**
 * Item.js — daftar item, simpan item (+ riwayat harga & HPP menu), aktif/nonaktif, muat awal.
 */

function muatAwal(token) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const admin = sesi.r === ROLE.ADMIN;
    const daftar = daftarItemCache_();
    const jual = daftar.filter(function (i) { return i.aktif && i.tipe !== 'Bahan'; });
    return {
      toko: infoToko_(bacaPengaturan_()),
      sesi: dataSesi_(sesi),
      items: jual.map(function (i) { return itemUntukKlien_(i, admin); }),
      kategori: kategoriUnik_(daftar),
      // Badge di menu Stok (Admin); termasuk Bahan yang tidak tampil di kasir.
      jumlahMenipis: admin ? daftar.filter(stokMenipis_).length : 0,
      shiftAktif: shiftAktifRingkas_(sesi.u),
    };
  });
}

function listItem(token, filter) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const admin = sesi.r === ROLE.ADMIN;
    const f = filter || {};
    const q = String(f.q || '').trim().toLowerCase();
    const hasil = daftarItemCache_().filter(function (i) {
      if (!admin && !i.aktif) return false;
      if (f.tipe && i.tipe !== f.tipe) return false;
      if (f.kategori && i.kategori !== f.kategori) return false;
      if (f.aktif === 'Ya' && !i.aktif) return false;
      if (f.aktif === 'Tidak' && i.aktif) return false;
      if (q && (i.nama + ' ' + i.kode + ' ' + i.id).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    return hasil.map(function (i) { return itemUntukKlien_(i, admin); });
  });
}

function simpanItem(token, item) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    return prosesSimpanItem_(sesi, item);
  });
}

function setAktifItem(token, id, aktif) {
  return jalankan_(token, ROLE.ADMIN, function () {
    return denganKunci_(function () {
      const data = bacaItem_();
      const it = data.peta[String(id)];
      if (!it) throw galat_('TIDAK_ADA', 'Item tidak ditemukan.');
      it.aktif = aktif === true || aktif === 'Ya';
      tulisSel_(data.tabel, it.idx, 'Aktif', it.aktif ? 'Ya' : 'Tidak');
      naikkanVersi_('item');
      return itemUntukKlien_(it, true);
    });
  });
}

// ---------- Internal ----------

function itemDariBaris_(t, r, idx) {
  const k = t.kol;
  return {
    idx: idx,
    id: String(r[k.ID]).trim(),
    kode: String(r[k.Kode]).trim(),
    nama: String(r[k.Nama]),
    tipe: String(r[k.Tipe]),
    kategori: String(r[k.Kategori]),
    satuan: String(r[k.Satuan]),
    hargaBeli: angka_(r[k['Harga Beli']]),
    hargaJual: angka_(r[k['Harga Jual']]),
    stok: bulatQty_(angka_(r[k.Stok])),
    stokMin: angka_(r[k['Stok Min']]),
    lacak: r[k['Lacak Stok']] === 'Ya',
    aktif: r[k.Aktif] === 'Ya',
    foto: String(r[k.Foto]).trim(),
  };
}

/** Baca Item langsung dari sheet (untuk operasi tulis & validasi). */
function bacaItem_() {
  const t = bacaTabel_(SHEET.ITEM);
  const daftar = [];
  const peta = {};
  t.baris.forEach(function (r, i) {
    if (String(r[t.kol.ID]).trim() === '') return;
    const it = itemDariBaris_(t, r, i);
    daftar.push(it);
    peta[it.id] = it;
  });
  return { tabel: t, daftar: daftar, peta: peta };
}

/** Semua item (termasuk nonaktif) dari cache; hanya untuk tampilan. */
function daftarItemCache_() {
  return denganCache_('item', function () { return bacaItem_().daftar; });
}

function itemUntukKlien_(i, admin) {
  const o = {
    id: i.id, kode: i.kode, nama: i.nama, tipe: i.tipe, kategori: i.kategori, satuan: i.satuan,
    hargaJual: i.hargaJual, stok: i.stok, stokMin: i.stokMin, lacak: i.lacak, aktif: i.aktif, foto: i.foto,
    menipis: stokMenipis_(i),
  };
  // Harga beli & margin adalah data bisnis; kasir tidak perlu melihatnya.
  if (admin) {
    o.hargaBeli = i.hargaBeli;
    o.margin = margin_(i.hargaJual, i.hargaBeli);
  }
  return o;
}

/** Status shift untuk indikator di topbar; aman bila sheet Shift belum dibuat (toko lama belum Setup ulang). */
function shiftAktifRingkas_(username) {
  if (!SpreadsheetApp.getActive().getSheetByName(SHEET.SHIFT)) return null;
  const temu = cariShiftAktif_(username);
  if (!temu) return null;
  return { id: temu.shift.id, buka: formatWaktu_(temu.shift.buka, zonaWaktu_(bacaPengaturan_())) };
}

function stokMenipis_(i) {
  return i.aktif && i.lacak && i.tipe !== 'Menu' && i.stok <= i.stokMin;
}

function kategoriUnik_(daftar) {
  const ada = {};
  daftar.forEach(function (i) { if (i.kategori) ada[i.kategori] = true; });
  return Object.keys(ada).sort();
}

function prosesSimpanItem_(sesi, input) {
  const data = normalisasiItem_(input);
  return denganKunci_(function () {
    const it = bacaItem_();
    const t = it.tabel;
    const resep = bacaResep_();
    const lama = data.id ? it.peta[data.id] : null;
    if (data.id && !lama) throw galat_('TIDAK_ADA', 'Item tidak ditemukan.');

    if (data.kode) {
      const kembar = it.daftar.find(function (x) {
        return x.kode.toLowerCase() === data.kode.toLowerCase() && x.id !== data.id;
      });
      if (kembar) throw galat_('VALIDASI', 'Kode ' + data.kode + ' sudah dipakai oleh ' + kembar.nama + '.');
    }
    if (lama && lama.tipe !== data.tipe && dipakaiResep_(lama.id, resep.peta)) {
      throw galat_('VALIDASI', 'Tipe tidak bisa diubah karena item ini dipakai di resep.');
    }

    const id = lama ? lama.id : idItemBerikut_(it.daftar.map(function (x) { return x.id; }));
    // HPP menu ber-resep selalu dihitung dari resep, bukan dari input.
    if (data.tipe === 'Menu' && (resep.peta[id] || []).length) {
      data.hargaBeli = hitungHppMenu_(resep.peta[id], it.peta);
    }

    const nilai = {
      ID: id,
      Kode: amanSel_(data.kode),
      Nama: amanSel_(data.nama),
      Tipe: data.tipe,
      Kategori: amanSel_(data.kategori),
      Satuan: amanSel_(data.satuan),
      'Harga Beli': data.hargaBeli,
      'Harga Jual': data.hargaJual,
      'Stok Min': data.stokMin,
      'Lacak Stok': data.lacak ? 'Ya' : 'Tidak',
      Aktif: data.aktif ? 'Ya' : 'Tidak',
      Foto: amanSel_(data.foto),
    };
    const sekarang = new Date();
    const logHarga = [];
    const hasil = {
      idx: lama ? lama.idx : -1,
      id: id, kode: data.kode, nama: data.nama, tipe: data.tipe, kategori: data.kategori, satuan: data.satuan,
      hargaBeli: data.hargaBeli, hargaJual: data.hargaJual, stok: lama ? lama.stok : data.stokAwal,
      stokMin: data.stokMin, lacak: data.lacak, aktif: data.aktif, foto: data.foto,
    };

    if (lama) {
      const row = keBaris_(t, nilai, t.baris[lama.idx]);
      tulisBaris_(t, lama.idx, row);
      t.baris[lama.idx] = row;
      if (lama.hargaBeli !== data.hargaBeli || lama.hargaJual !== data.hargaJual) {
        logHarga.push({ id: id, hbLama: lama.hargaBeli, hbBaru: data.hargaBeli, hjLama: lama.hargaJual, hjBaru: data.hargaJual });
      }
    } else {
      nilai.Stok = data.stokAwal;
      tambahObjek_(t, [nilai]);
      logHarga.push({ id: id, hbLama: '', hbBaru: data.hargaBeli, hjLama: '', hjBaru: data.hargaJual });
      if (data.stokAwal > 0) {
        tambahObjek_(bacaHeader_(SHEET.STOK_LOG), [{
          Tanggal: sekarang, 'ID Item': id, Nama: amanSel_(data.nama), Jenis: 'Masuk', Qty: data.stokAwal,
          'Stok Sesudah': data.stokAwal, Ref: '', 'Kasir/User': sesi.u, Keterangan: 'Stok awal',
        }]);
      }
    }

    it.peta[id] = hasil;
    terapkanHppMenu_(it, resep.peta, logHarga);
    catatHarga_(logHarga, sekarang, sesi.u);
    naikkanVersi_('item');
    return itemUntukKlien_(hasil, true);
  });
}

/**
 * Setelah harga beli bahan berubah (di memori), hitung ulang HPP menu yang memakainya,
 * tulis kolom Harga Beli sekaligus, dan tambahkan entri ke logHarga.
 * Mengembalikan true bila kolom Harga Beli ditulis ulang.
 */
function terapkanHppMenu_(it, petaResep, logHarga) {
  const berubah = hppMenuBerubah_(it.peta, petaResep);
  if (!berubah.length) return false;
  const t = it.tabel;
  const kolHb = t.kol['Harga Beli'];
  berubah.forEach(function (b) {
    const menu = it.peta[b.id];
    t.baris[menu.idx][kolHb] = b.baru;
    menu.hargaBeli = b.baru;
    logHarga.push({ id: b.id, hbLama: b.lama, hbBaru: b.baru, hjLama: menu.hargaJual, hjBaru: menu.hargaJual });
  });
  tulisKolom_(t, 'Harga Beli', t.baris.map(function (r) { return r[kolHb]; }));
  return true;
}

/**
 * Ubah harga jual massal (Admin). data: {kategori, tipe, mode: 'persen'|'nominal', nilai, bulat, pratinjau}.
 * pratinjau = true: hanya menghitung, tidak menyimpan. Setiap perubahan tercatat di Harga_Log.
 */
function ubahHargaMassal(token, data) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    const opsi = normalisasiHargaMassal_(data);
    if (data && data.pratinjau) return { perubahan: hitungHargaMassal_(bacaItem_().daftar, opsi), disimpan: false };
    return denganKunci_(function () {
      const it = bacaItem_();
      const perubahan = hitungHargaMassal_(it.daftar, opsi);
      if (!perubahan.length) throw galat_('VALIDASI', 'Tidak ada harga yang berubah untuk pilihan ini.');
      const kolHj = it.tabel.kol['Harga Jual'];
      perubahan.forEach(function (p) { it.tabel.baris[it.peta[p.id].idx][kolHj] = p.baru; });
      tulisKolom_(it.tabel, 'Harga Jual', it.tabel.baris.map(function (r) { return r[kolHj]; }));
      catatHarga_(perubahan.map(function (p) {
        const i = it.peta[p.id];
        return { id: p.id, hbLama: i.hargaBeli, hbBaru: i.hargaBeli, hjLama: p.lama, hjBaru: p.baru };
      }), new Date(), sesi.u);
      naikkanVersi_('item');
      return { perubahan: perubahan, disimpan: true };
    });
  });
}

/**
 * Impor item dari teks tabel (tempel dari Excel/Sheets atau isi file CSV). Admin.
 * data: {teks, mode: 'tambah'|'perbarui', buatBarcode, pratinjau}
 * - Baris pertama = judul kolom (nama kolom bebas, lihat petaKolomImpor_). Nama item dipakai sebagai kunci.
 * - mode 'tambah': item yang namanya sudah ada dilewati. 'perbarui': harga/kategori/satuan/kode/stok min diperbarui
 *   (stok TIDAK diubah — gunakan Stok masuk/Opname agar tercatat di riwayat).
 * - pratinjau: hanya laporan per baris, tidak menyimpan.
 */
function imporItem(token, data) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    const d = data || {};
    const teks = String(d.teks || '');
    if (teks.length > 500000) throw galat_('VALIDASI', 'Data terlalu besar (maks ±500 KB). Pecah menjadi beberapa impor.');
    const tabel = parseTabelTeks_(teks);
    if (!tabel.baris.length) throw galat_('VALIDASI', 'Tidak ada baris data. Baris pertama harus berisi judul kolom.');
    if (tabel.baris.length > MAKS_BARIS_IMPOR) throw galat_('VALIDASI', 'Maksimal ' + MAKS_BARIS_IMPOR + ' baris per impor.');
    const peta = petaKolomImpor_(tabel.header);
    const jalankan = function () {
      const it = bacaItem_();
      const rencana = rencanaImpor_(tabel, peta, it, d.mode === 'perbarui', !!d.buatBarcode);
      if (!d.pratinjau) terapkanImpor_(rencana, it, sesi);
      return {
        disimpan: !d.pratinjau, kolom: Object.keys(peta), baru: rencana.baru.length, diperbarui: rencana.ubah.length,
        dilewati: rencana.laporan.filter(function (l) { return l.aksi === 'Lewati'; }).length,
        galat: rencana.laporan.filter(function (l) { return l.aksi === 'Galat'; }).length,
        laporan: rencana.laporan.slice(0, 300),
      };
    };
    return d.pratinjau ? jalankan() : denganKunci_(jalankan);
  });
}

function ringkasPersediaan(token) {
  return jalankan_(token, ROLE.ADMIN, function () {
    return hitungPersediaan_(daftarItemCache_());
  });
}

/**
 * Data label harga + barcode untuk item terpilih. buatKode: item tanpa kode diberi barcode EAN-13 otomatis
 * (awalan 200, dari ID item) dan disimpan. bits = pola batang EAN-13 (null bila kode bukan EAN-13).
 */
function labelItem(token, data) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const d = data || {};
    const ids = Array.isArray(d.ids) ? d.ids.map(String).slice(0, 500) : [];
    if (!ids.length) throw galat_('VALIDASI', 'Pilih minimal satu item.');
    const jalankan = function () {
      const it = bacaItem_();
      const terpakai = {};
      it.daftar.forEach(function (i) { if (i.kode) terpakai[i.kode] = true; });
      let adaBaru = false;
      const hasil = ids.map(function (id) {
        const i = it.peta[id];
        if (!i) throw galat_('TIDAK_ADA', 'Item ' + id + ' tidak ditemukan.');
        if (!i.kode && d.buatKode && i.tipe !== 'Bahan') {
          const kode = kodeDariIdItem_(i.id);
          if (kode && !terpakai[kode]) {
            i.kode = kode;
            terpakai[kode] = true;
            it.tabel.baris[i.idx][it.tabel.kol.Kode] = kode;
            adaBaru = true;
          }
        }
        let bits = null;
        try { bits = i.kode ? ean13Bits_(i.kode) : null; } catch (e) { bits = null; }
        return { id: i.id, nama: i.nama, harga: i.hargaJual, satuan: i.satuan, kode: i.kode, bits: bits };
      });
      if (adaBaru) {
        const kol = it.tabel.kol.Kode;
        // Kode berupa teks (apostrof) agar angka 13 digit tidak diubah Sheets menjadi notasi ilmiah.
        tulisKolom_(it.tabel, 'Kode', it.tabel.baris.map(function (r) { return r[kol] === '' ? '' : amanSel_(String(r[kol])); }));
        naikkanVersi_('item');
      }
      return hasil;
    };
    return d.buatKode ? denganKunci_(jalankan) : jalankan();
  });
}

/** Susun rencana impor per baris (tanpa menulis). */
function rencanaImpor_(tabel, peta, it, perbarui, buatBarcode) {
  const namaAda = {};
  it.daftar.forEach(function (i) { namaAda[i.nama.toLowerCase()] = i; });
  const kodeAda = {};
  it.daftar.forEach(function (i) { if (i.kode) kodeAda[i.kode.toLowerCase()] = i.id; });
  const semuaId = it.daftar.map(function (i) { return i.id; });
  const diFile = {};
  const r = { baru: [], ubah: [], laporan: [], kolom: peta };

  tabel.baris.forEach(function (row, n) {
    const nomor = n + 2; // baris 1 = judul
    let data;
    try {
      data = normalisasiItem_(barisImporKeItem_(row, peta));
    } catch (e) {
      r.laporan.push({ baris: nomor, nama: String(row[peta.nama] || ''), aksi: 'Galat', pesan: e.message });
      return;
    }
    const kunci = data.nama.toLowerCase();
    if (diFile[kunci]) {
      r.laporan.push({ baris: nomor, nama: data.nama, aksi: 'Lewati', pesan: 'Nama ganda di file (baris ' + diFile[kunci] + ').' });
      return;
    }
    diFile[kunci] = nomor;
    const lama = namaAda[kunci];
    const pemilikKode = data.kode ? kodeAda[data.kode.toLowerCase()] : null;
    if (pemilikKode && (!lama || pemilikKode !== lama.id)) {
      r.laporan.push({ baris: nomor, nama: data.nama, aksi: 'Galat', pesan: 'Kode ' + data.kode + ' sudah dipakai item lain.' });
      return;
    }
    if (lama) {
      if (!perbarui) {
        r.laporan.push({ baris: nomor, nama: data.nama, aksi: 'Lewati', pesan: 'Sudah ada (' + lama.id + ').' });
        return;
      }
      if (lama.tipe !== data.tipe) {
        r.laporan.push({ baris: nomor, nama: data.nama, aksi: 'Galat', pesan: 'Tipe berbeda dari item yang ada (' + lama.tipe + ').' });
        return;
      }
      if (data.kode) kodeAda[data.kode.toLowerCase()] = lama.id;
      r.ubah.push({ lama: lama, data: data });
      r.laporan.push({ baris: nomor, nama: data.nama, aksi: 'Perbarui', pesan: lama.id + (lama.hargaJual !== data.hargaJual ? ' · harga ' + lama.hargaJual + ' → ' + data.hargaJual : '') });
      return;
    }
    const id = idItemBerikut_(semuaId);
    semuaId.push(id);
    let kode = data.kode;
    if (!kode && buatBarcode && data.tipe === 'Barang') {
      const k = kodeDariIdItem_(id);
      if (k && !kodeAda[k.toLowerCase()]) kode = k;
    }
    if (kode) kodeAda[kode.toLowerCase()] = id;
    data.kode = kode;
    r.baru.push({ id: id, data: data });
    r.laporan.push({ baris: nomor, nama: data.nama, aksi: 'Baru', pesan: id + (kode ? ' · ' + kode : '') });
  });
  return r;
}

/** Tulis rencana impor: pembaruan dalam satu setValues, item baru ditambahkan, log harga & stok awal dicatat. */
function terapkanImpor_(rencana, it, sesi) {
  const t = it.tabel;
  const k = t.kol;
  const sekarang = new Date();
  const logHarga = [];
  const resep = bacaResep_();
  const ada = function (f) { return rencana.kolom[f] !== undefined; };
  rencana.ubah.forEach(function (u) {
    const row = t.baris[u.lama.idx];
    const d = u.data;
    // HPP menu ber-resep tetap dihitung dari resep, bukan dari file.
    const hbBaru = !ada('hargaBeli') || (d.tipe === 'Menu' && (resep.peta[u.lama.id] || []).length) ? u.lama.hargaBeli : d.hargaBeli;
    const hjBaru = ada('hargaJual') ? d.hargaJual : u.lama.hargaJual;
    // Hanya kolom yang ADA di file yang diperbarui (file "Nama + Harga" tidak boleh menolkan harga beli, dst.).
    if (d.kode) row[k.Kode] = d.kode;
    if (ada('kategori') && d.kategori) row[k.Kategori] = d.kategori;
    if (ada('satuan')) row[k.Satuan] = d.satuan;
    row[k['Harga Beli']] = hbBaru;
    if (ada('hargaJual')) row[k['Harga Jual']] = d.hargaJual;
    if (ada('stokMin')) row[k['Stok Min']] = d.stokMin;
    if (ada('lacak')) row[k['Lacak Stok']] = d.lacak ? 'Ya' : 'Tidak';
    if (u.lama.hargaBeli !== hbBaru || u.lama.hargaJual !== hjBaru) {
      logHarga.push({ id: u.lama.id, hbLama: u.lama.hargaBeli, hbBaru: hbBaru, hjLama: u.lama.hargaJual, hjBaru: hjBaru });
    }
    it.peta[u.lama.id].hargaBeli = hbBaru;
  });
  if (rencana.ubah.length) {
    tulisSemuaBaris_(t);
    terapkanHppMenu_(it, resep.peta, logHarga);
  }
  if (rencana.baru.length) {
    tambahObjek_(t, rencana.baru.map(function (b) {
      const d = b.data;
      return {
        ID: b.id, Kode: amanSel_(d.kode), Nama: amanSel_(d.nama), Tipe: d.tipe, Kategori: amanSel_(d.kategori),
        Satuan: amanSel_(d.satuan), 'Harga Beli': d.hargaBeli, 'Harga Jual': d.hargaJual, Stok: d.stokAwal,
        'Stok Min': d.stokMin, 'Lacak Stok': d.lacak ? 'Ya' : 'Tidak', Aktif: 'Ya', Foto: '',
      };
    }));
    rencana.baru.forEach(function (b) {
      logHarga.push({ id: b.id, hbLama: '', hbBaru: b.data.hargaBeli, hjLama: '', hjBaru: b.data.hargaJual });
    });
    const logStok = rencana.baru.filter(function (b) { return b.data.stokAwal > 0; }).map(function (b) {
      return {
        Tanggal: sekarang, 'ID Item': b.id, Nama: amanSel_(b.data.nama), Jenis: 'Masuk', Qty: b.data.stokAwal,
        'Stok Sesudah': b.data.stokAwal, Ref: '', 'Kasir/User': sesi.u, Keterangan: 'Impor item',
      };
    });
    tambahObjek_(bacaHeader_(SHEET.STOK_LOG), logStok);
  }
  catatHarga_(logHarga, sekarang, sesi.u);
  naikkanVersi_('item');
}

function riwayatHarga(token, id) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const idItem = String(id || '');
    const tz = zonaWaktu_(bacaPengaturan_());
    const hasil = [];
    telusuriMundur_(SHEET.HARGA_LOG, function (r, i, t) {
      if (String(r[t.kol['ID Item']]) !== idItem) return true;
      hasil.push({
        tanggal: formatWaktu_(r[t.kol.Tanggal], tz),
        hargaBeliLama: r[t.kol['Harga Beli Lama']], hargaBeliBaru: r[t.kol['Harga Beli Baru']],
        hargaJualLama: r[t.kol['Harga Jual Lama']], hargaJualBaru: r[t.kol['Harga Jual Baru']],
        user: String(r[t.kol.User]),
      });
      return hasil.length < 100;
    });
    return hasil;
  });
}

function dipakaiResep_(id, petaResep) {
  return Object.keys(petaResep).some(function (idMenu) {
    return idMenu === id || petaResep[idMenu].some(function (r) { return r.idBahan === id; });
  });
}

function catatHarga_(entri, tanggal, user) {
  if (!entri.length) return;
  tambahObjek_(bacaHeader_(SHEET.HARGA_LOG), entri.map(function (e) {
    return {
      Tanggal: tanggal, 'ID Item': e.id, 'Harga Beli Lama': e.hbLama, 'Harga Beli Baru': e.hbBaru,
      'Harga Jual Lama': e.hjLama, 'Harga Jual Baru': e.hjBaru, User: user,
    };
  }));
}
