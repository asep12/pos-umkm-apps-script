/**
 * Transaksi.js — buat transaksi (potong stok langsung & lewat resep), nomor nota, ambil nota,
 * daftar transaksi, dan void (khusus Admin).
 */

function buatTransaksi(token, trx) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    return prosesBuatTransaksi_(sesi, trx);
  });
}

function getNota(token, noNota) {
  return jalankan_(token, ROLE.KASIR, function () {
    const no = String(noNota || '').trim().toUpperCase();
    if (!no || no.length > 40) throw galat_('VALIDASI', 'Nomor nota tidak valid.');
    return ambilNota_(no);
  });
}

function listTransaksi(token, filter) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    return cariTransaksi_(sesi, filter || {});
  });
}

function voidTransaksi(token, noNota, alasan) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    const no = String(noNota || '').trim().toUpperCase();
    if (!no || no.length > 40) throw galat_('VALIDASI', 'Nomor nota tidak valid.');
    return prosesVoid_(sesi, no, teksBersih_(alasan, 200, 'Alasan batal', true));
  });
}

// ---------- Internal ----------

function prosesBuatTransaksi_(sesi, input) {
  const trx = normalisasiTransaksi_(input);
  return denganKunci_(function () {
    // Semua data dibaca SEGAR di dalam kunci: harga & stok terbaru, bukan dari cache/klien.
    const toko = infoToko_(bacaPengaturanSegar_());
    if (toko.wajibBukaKasir && !cariShiftAktif_(sesi.u)) {
      throw galat_('SHIFT_TUTUP', 'Buka kasir (shift) terlebih dahulu di menu Kas.');
    }
    const it = bacaItem_();
    const resep = bacaResep_();
    // Membayar bill terbuka: pastikan bill masih terbuka & tidak diubah perangkat lain (versi).
    const idBill = input && input.idBill ? String(input.idBill) : '';
    const tabelBill = idBill ? bacaTabel_(SHEET.BILL) : null;
    const temuBill = idBill ? cariBillTerbuka_(tabelBill, idBill, String(input.versiBill || '')) : null;

    const hitung = hitungTransaksi_(trx, it.peta, toko.pajakPersen);
    const butuh = hitungKebutuhanStok_(hitung.baris, it.peta, resep.peta);
    const kurang = cekStok_(butuh, it.peta, toko.izinkanStokMinus);
    if (kurang.length) throw galat_('STOK_KURANG', pesanStokKurang_(kurang));

    const sekarang = new Date();
    const noNota = nomorNota_(toko.prefixNota, sekarang, toko.zonaWaktu);

    const kolStok = it.tabel.kol.Stok;
    const stokBaru = {};
    const logStok = Object.keys(butuh).map(function (id) {
      const item = it.peta[id];
      const sesudah = bulatQty_(item.stok - butuh[id]);
      it.tabel.baris[item.idx][kolStok] = sesudah;
      stokBaru[id] = sesudah;
      return {
        Tanggal: sekarang, 'ID Item': id, Nama: amanSel_(item.nama), Jenis: 'Jual', Qty: -butuh[id],
        'Stok Sesudah': sesudah, Ref: noNota, 'Kasir/User': sesi.u, Keterangan: '',
      };
    });

    const baris = {
      'No Nota': noNota, Tanggal: sekarang, Kasir: sesi.u, Subtotal: hitung.subtotal, Diskon: hitung.diskon,
      Pajak: hitung.pajak, Total: hitung.total, Metode: trx.metode, Status: 'Lunas', Referensi: amanSel_(trx.referensi),
      Bayar: hitung.bayar, Kembalian: hitung.kembalian, Catatan: amanSel_(trx.catatan),
    };
    tambahObjek_(bacaHeader_(SHEET.TRANSAKSI), [baris]);
    tambahObjek_(bacaHeader_(SHEET.DETAIL), hitung.baris.map(function (b) {
      return {
        'No Nota': noNota, 'ID Item': b.idItem, Nama: amanSel_(b.nama), Qty: b.qty,
        Harga: b.harga, Subtotal: b.subtotal, 'HPP Satuan': b.hppSatuan,
      };
    }));
    tambahObjek_(bacaHeader_(SHEET.STOK_LOG), logStok);
    // Satu setValues untuk seluruh kolom Stok; aman karena semua penulis Item memakai kunci yang sama.
    if (logStok.length) tulisKolom_(it.tabel, 'Stok', it.tabel.baris.map(function (r) { return r[kolStok]; }));
    if (temuBill) {
      tulisBaris_(tabelBill, temuBill.idx, keBaris_(tabelBill, {
        Status: 'Dibayar', 'No Nota': noNota, Diperbarui: sekarang,
      }, tabelBill.baris[temuBill.idx]));
    }
    naikkanVersi_('item');

    const nota = susunNota_(
      Object.assign({}, baris, { Referensi: trx.referensi, Catatan: trx.catatan }),
      hitung.baris, toko, sesi.nama
    );
    nota.stokBaru = stokBaru;
    return nota;
  });
}

/** Nomor nota PREFIX-YYMMDD-NNNN. Wajib dipanggil di dalam denganKunci_ agar tidak ganda. */
function nomorNota_(prefix, sekarang, tz) {
  return nomorUrut_('NOTA_URUT', prefix, sekarang, tz);
}

/** Nomor berurutan harian PREFIX-YYMMDD-NNNN dengan penghitung di ScriptProperties. Panggil di dalam kunci. */
function nomorUrut_(kunciProp, prefix, sekarang, tz) {
  const hari = Utilities.formatDate(sekarang, tz, 'yyMMdd');
  const p = props_();
  const urut = urutNotaBerikut_(p.getProperty(kunciProp), hari);
  p.setProperty(kunciProp, hari + '|' + urut);
  return formatNomorNota_(prefix, hari, urut);
}

/** Cari baris transaksi dari bawah. Mengembalikan {tabel, idx, trx} atau melempar TIDAK_ADA. */
function cariTransaksiNota_(noNota) {
  let idx = -1;
  let trx = null;
  const t = telusuriMundur_(SHEET.TRANSAKSI, function (r, i, tb) {
    if (String(r[tb.kol['No Nota']]).trim().toUpperCase() !== noNota) return true;
    idx = i;
    trx = keObjek_(tb, r);
    return false;
  });
  if (idx === -1) throw galat_('TIDAK_ADA', 'Nota ' + noNota + ' tidak ditemukan.');
  return { tabel: t, idx: idx, trx: trx };
}

function ambilNota_(noNota) {
  const trx = cariTransaksiNota_(noNota).trx;
  // Baris Detail satu nota ditulis sekaligus (berurutan): berhenti setelah kelompoknya terlewati.
  const detail = [];
  telusuriMundur_(SHEET.DETAIL, function (r, i, d) {
    if (String(r[d.kol['No Nota']]).trim().toUpperCase() !== noNota) return detail.length === 0;
    detail.unshift({
      nama: String(r[d.kol.Nama]), qty: angka_(r[d.kol.Qty]),
      harga: angka_(r[d.kol.Harga]), subtotal: angka_(r[d.kol.Subtotal]),
    });
    return true;
  });
  const user = petaPengguna_()[String(trx.Kasir)];
  return susunNota_(trx, detail, infoToko_(bacaPengaturan_()), user ? user.nama : '');
}

/** Bentuk nota untuk klien (struk). Tanpa objek Date. */
function susunNota_(trx, detail, toko, namaKasir) {
  const nota = {
    noNota: String(trx['No Nota']),
    tanggal: formatWaktu_(trx.Tanggal, toko.zonaWaktu),
    kasir: namaKasir || String(trx.Kasir),
    items: detail.map(function (b) {
      return { nama: String(b.nama), qty: b.qty, harga: b.harga, subtotal: b.subtotal };
    }),
    subtotal: angka_(trx.Subtotal),
    diskon: angka_(trx.Diskon),
    pajak: angka_(trx.Pajak),
    total: angka_(trx.Total),
    metode: String(trx.Metode),
    bayar: angka_(trx.Bayar),
    kembalian: angka_(trx.Kembalian),
    referensi: String(trx.Referensi || ''),
    catatan: String(trx.Catatan || ''),
    status: String(trx.Status),
    toko: {
      nama: toko.nama, alamat: toko.alamat, telepon: toko.telepon,
      footer: toko.footer, lebarStruk: toko.lebarStruk, pajakPersen: toko.pajakPersen,
    },
  };
  // Baris teks untuk printer thermal (RawBT); struk HTML tetap dibuat di klien.
  nota.teks = strukTeks_(nota, kolomStruk_(toko.lebarStruk));
  return nota;
}

/**
 * Daftar transaksi. Kasir: hanya transaksinya sendiri hari ini. Admin: filter tanggal/kasir/status/nota.
 * Ringkasan dihitung dari seluruh rentang; daftar dibatasi 300 baris terbaru.
 */
function cariTransaksi_(sesi, f) {
  const tz = zonaWaktu_(bacaPengaturan_());
  const hariIni = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const admin = sesi.r === ROLE.ADMIN;
  const rentang = admin ? rentangTanggal_(f.dari, f.sampai, hariIni) : { dari: hariIni, sampai: hariIni };
  const kasir = admin ? String(f.kasir || '').trim().toLowerCase() : sesi.u;
  const status = admin && f.status ? String(f.status) : '';
  const q = String(f.q || '').trim().toUpperCase();
  const batas = 300;
  const pengguna = petaPengguna_();
  const baris = [];
  const ringkas = { jumlah: 0, total: 0, batal: 0 };

  telusuriMundur_(SHEET.TRANSAKSI, function (r, i, t) {
    const tgl = r[t.kol.Tanggal];
    const hari = tgl instanceof Date ? Utilities.formatDate(tgl, tz, 'yyyy-MM-dd') : '';
    if (hari && hari < rentang.dari) return false;
    if (!hari || hari > rentang.sampai) return true;
    const user = String(r[t.kol.Kasir]).toLowerCase();
    const st = String(r[t.kol.Status]);
    const no = String(r[t.kol['No Nota']]);
    if (kasir && user !== kasir) return true;
    if (status && st !== status) return true;
    const namaKasir = pengguna[user] ? pengguna[user].nama : user;
    // Cari cocok di nomor nota, username, atau nama kasir.
    if (q && no.toUpperCase().indexOf(q) === -1 && user.toUpperCase().indexOf(q) === -1 && namaKasir.toUpperCase().indexOf(q) === -1) return true;
    const total = angka_(r[t.kol.Total]);
    if (st === 'Batal') ringkas.batal++;
    else {
      ringkas.jumlah++;
      ringkas.total += total;
    }
    if (baris.length < batas) {
      baris.push({
        noNota: no, tanggal: formatWaktu_(tgl, tz), kasir: namaKasir,
        total: total, metode: String(r[t.kol.Metode]), status: st,
      });
    }
    return true;
  });
  return { baris: baris, ringkas: ringkas, penuh: baris.length >= batas, rentang: rentang };
}

/**
 * Void: status jadi Batal, stok dikembalikan persis sesuai baris "Jual" di Stok_Log nota ini
 * (bukan dihitung ulang dari resep, karena resep bisa sudah berubah). Baris asli tidak dihapus.
 */
function prosesVoid_(sesi, noNota, alasan) {
  denganKunci_(function () {
    const temu = cariTransaksiNota_(noNota);
    if (temu.trx.Status === 'Batal') throw galat_('VALIDASI', 'Nota ' + noNota + ' sudah dibatalkan.');
    const waktuTrx = temu.trx.Tanggal instanceof Date ? temu.trx.Tanggal.getTime() : 0;

    // Log Jual ditulis bersamaan dengan transaksi (Tanggal sama): berhenti saat lebih lama dari transaksi.
    const kembali = {};
    telusuriMundur_(SHEET.STOK_LOG, function (r, i, t) {
      const tgl = r[t.kol.Tanggal];
      // Toleransi 1 menit: presisi waktu di Sheets bisa dibulatkan.
      if (tgl instanceof Date && tgl.getTime() < waktuTrx - 60000) return false;
      if (String(r[t.kol.Ref]) === noNota && r[t.kol.Jenis] === 'Jual') {
        const id = String(r[t.kol['ID Item']]);
        kembali[id] = bulatQty_((kembali[id] || 0) - angka_(r[t.kol.Qty]));
      }
      return true;
    });

    const it = bacaItem_();
    const kolStok = it.tabel.kol.Stok;
    const sekarang = new Date();
    const log = [];
    Object.keys(kembali).forEach(function (id) {
      const item = it.peta[id];
      if (!item || !(kembali[id] > 0)) return;
      item.stok = bulatQty_(item.stok + kembali[id]);
      it.tabel.baris[item.idx][kolStok] = item.stok;
      log.push({
        Tanggal: sekarang, 'ID Item': id, Nama: amanSel_(item.nama), Jenis: 'Void', Qty: kembali[id],
        'Stok Sesudah': item.stok, Ref: noNota, 'Kasir/User': sesi.u, Keterangan: amanSel_('Void: ' + alasan),
      });
    });
    if (log.length) {
      tulisKolom_(it.tabel, 'Stok', it.tabel.baris.map(function (r) { return r[kolStok]; }));
      tambahObjek_(bacaHeader_(SHEET.STOK_LOG), log);
    }

    const catatanLama = String(temu.trx.Catatan || '');
    tulisSel_(temu.tabel, temu.idx, 'Status', 'Batal');
    tulisSel_(temu.tabel, temu.idx, 'Catatan', amanSel_((catatanLama ? catatanLama + ' | ' : '') + 'BATAL oleh ' + sesi.u + ': ' + alasan));
    naikkanVersi_('item');
  });
  return ambilNota_(noNota);
}
