/**
 * Kas.js — shift kasir (buka/tutup laci), kas masuk/keluar, riwayat shift & arus kas.
 * Kasir mengelola shift miliknya sendiri; Admin melihat semua dan bisa menutup shift kasir lain.
 * Penjualan per shift dihitung dari sheet Transaksi (kasir + rentang waktu shift), jadi Transaksi tidak perlu kolom baru.
 */

function infoShift(token) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const toko = infoToko_(bacaPengaturan_());
    const temu = cariShiftAktif_(sesi.u);
    return {
      wajibBukaKasir: toko.wajibBukaKasir,
      kategori: KATEGORI_KAS,
      pecahan: PECAHAN_UANG,
      shift: temu ? susunRekapShift_(temu.shift, toko, new Date()) : null,
    };
  });
}

function bukaShift(token, data) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const d = data || {};
    const modal = bulatUang_(angkaBersih_(d.modalAwal, 'Modal awal', { min: 0, bawaan: 0 }));
    const catatan = teksBersih_(d.catatan, 200, 'Catatan');
    const toko = infoToko_(bacaPengaturan_());
    return denganKunci_(function () {
      if (cariShiftAktif_(sesi.u)) throw galat_('VALIDASI', 'Anda masih punya shift yang terbuka. Tutup dulu sebelum membuka yang baru.');
      const sekarang = new Date();
      const shift = { id: nomorUrut_('SHIFT_URUT', 'SFT', sekarang, toko.zonaWaktu), kasir: sesi.u, buka: sekarang, modalAwal: modal, status: 'Buka', catatan: catatan };
      tambahObjek_(bacaHeader_(SHEET.SHIFT), [{
        ID: shift.id, Kasir: sesi.u, Buka: sekarang, 'Modal Awal': modal, Status: 'Buka', Catatan: amanSel_(catatan),
      }]);
      return susunRekapShift_(shift, toko, sekarang);
    });
  });
}

function catatKas(token, data) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const k = normalisasiKas_(data);
    const toko = infoToko_(bacaPengaturan_());
    return denganKunci_(function () {
      const temu = cariShiftAktif_(sesi.u);
      // Kasir hanya mencatat kas selama shift-nya terbuka; Admin boleh mencatat kas toko tanpa shift.
      if (!temu && sesi.r !== ROLE.ADMIN) throw galat_('SHIFT_TUTUP', 'Buka kasir (shift) terlebih dahulu.');
      const sekarang = new Date();
      const entri = {
        id: nomorUrut_('KAS_URUT', 'KAS', sekarang, toko.zonaWaktu), tanggal: formatWaktu_(sekarang, toko.zonaWaktu),
        jenis: k.jenis, kategori: k.kategori, jumlah: k.jumlah, keterangan: k.keterangan, user: sesi.u, shift: temu ? temu.shift.id : '',
      };
      tambahObjek_(bacaHeader_(SHEET.KAS), [{
        ID: entri.id, Tanggal: sekarang, Jenis: k.jenis, Kategori: k.kategori, Jumlah: k.jumlah,
        Keterangan: amanSel_(k.keterangan), User: sesi.u, Shift: entri.shift,
      }]);
      return entri;
    });
  });
}

/**
 * Tutup shift. data: {kasFisik} atau {pecahan: {100000: n, ...}}, catatan, idShift (hanya Admin, untuk menutup shift kasir lain).
 * Angka rekap disimpan sebagai snapshot: void setelah shift ditutup tidak mengubah rekap yang sudah tercetak.
 */
function tutupShift(token, data) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const d = data || {};
    const fisik = d.pecahan ? hitungPecahan_(d.pecahan) : bulatUang_(angkaBersih_(d.kasFisik, 'Uang fisik di laci', { min: 0 }));
    const catatan = teksBersih_(d.catatan, 200, 'Catatan');
    const toko = infoToko_(bacaPengaturan_());
    return denganKunci_(function () {
      const temu = d.idShift && sesi.r === ROLE.ADMIN ? cariShiftId_(String(d.idShift)) : cariShiftAktif_(sesi.u);
      if (!temu) throw galat_('TIDAK_ADA', 'Tidak ada shift terbuka.');
      if (temu.shift.status !== 'Buka') throw galat_('VALIDASI', 'Shift ' + temu.shift.id + ' sudah ditutup.');
      const sekarang = new Date();
      const data2 = kumpulkanShift_(temu.shift, sekarang, toko.zonaWaktu);
      const r = rekapShift_(temu.shift.modalAwal, data2.trx, data2.kas);
      const selisih = fisik - r.kasSeharusnya;
      const catatanAkhir = [temu.shift.catatan, catatan, temu.shift.kasir !== sesi.u ? 'ditutup oleh ' + sesi.u : '']
        .filter(Boolean).join(' | ');
      tulisBaris_(temu.tabel, temu.idx, keBaris_(temu.tabel, {
        Tutup: sekarang, 'Jumlah Transaksi': r.jumlahTrx, 'Penjualan Tunai': r.penjualanTunai, 'Penjualan Non Tunai': r.penjualanNonTunai,
        'Kas Masuk': r.kasMasuk, 'Kas Keluar': r.kasKeluar, 'Kas Seharusnya': r.kasSeharusnya, 'Kas Fisik': fisik, Selisih: selisih,
        Status: 'Tutup', Catatan: amanSel_(catatanAkhir),
      }, temu.tabel.baris[temu.idx]));
      const tutup = Object.assign({}, temu.shift, {
        status: 'Tutup', tutup: sekarang, catatan: catatanAkhir, kasFisik: fisik, selisih: selisih,
      });
      return susunRekapShift_(tutup, toko, sekarang, r);
    });
  });
}

function getShift(token, id) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    const temu = cariShiftId_(String(id || ''));
    if (!temu) throw galat_('TIDAK_ADA', 'Shift tidak ditemukan.');
    if (sesi.r !== ROLE.ADMIN && temu.shift.kasir !== sesi.u) throw galat_('AKSES_DITOLAK', 'Anda hanya bisa melihat shift sendiri.');
    return susunRekapShift_(temu.shift, infoToko_(bacaPengaturan_()), new Date());
  });
}

function listShift(token, filter) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const f = filter || {};
    const toko = infoToko_(bacaPengaturan_());
    const tz = toko.zonaWaktu;
    const r = rentangLaporan_(f.dari, f.sampai, hariIni_(tz));
    const pengguna = petaPengguna_();
    const t = bacaTabel_(SHEET.SHIFT);
    const hasil = [];
    t.baris.forEach(function (row, i) {
      const s = shiftDariBaris_(t, row, i);
      if (!s.id) return;
      const hari = s.buka instanceof Date ? Utilities.formatDate(s.buka, tz, 'yyyy-MM-dd') : '';
      // Shift yang masih terbuka selalu ditampilkan agar Admin bisa menutupnya.
      if (s.status !== 'Buka' && (hari < r.dari || hari > r.sampai)) return;
      hasil.push({
        id: s.id, kasir: s.kasir, namaKasir: pengguna[s.kasir] ? pengguna[s.kasir].nama : s.kasir, status: s.status,
        buka: formatWaktu_(s.buka, tz), tutup: formatWaktu_(s.tutup, tz), modalAwal: s.modalAwal,
        penjualanTunai: s.penjualanTunai, kasSeharusnya: s.kasSeharusnya, kasFisik: s.kasFisik, selisih: s.selisih,
      });
    });
    hasil.reverse();
    return { baris: hasil, rentang: r };
  });
}

function listKas(token, filter) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const f = filter || {};
    const tz = zonaWaktu_(bacaPengaturan_());
    const r = rentangLaporan_(f.dari, f.sampai, hariIni_(tz));
    const jenis = f.jenis ? String(f.jenis) : '';
    const kas = kumpulkanKas_(r, tz).filter(function (k) { return !jenis || k.jenis === jenis; });
    return { baris: kas.slice(0, 300), ringkas: ringkasKas_(kas), penuh: kas.length > 300, rentang: r };
  });
}

// ---------- Internal ----------

function shiftDariBaris_(t, r, idx) {
  const k = t.kol;
  return {
    idx: idx, id: String(r[k.ID]).trim(), kasir: String(r[k.Kasir]).trim().toLowerCase(),
    buka: r[k.Buka], tutup: r[k.Tutup], modalAwal: angka_(r[k['Modal Awal']]), status: String(r[k.Status]),
    jumlahTrx: angka_(r[k['Jumlah Transaksi']]), penjualanTunai: angka_(r[k['Penjualan Tunai']]),
    penjualanNonTunai: angka_(r[k['Penjualan Non Tunai']]), kasMasuk: angka_(r[k['Kas Masuk']]), kasKeluar: angka_(r[k['Kas Keluar']]),
    kasSeharusnya: angka_(r[k['Kas Seharusnya']]), kasFisik: angka_(r[k['Kas Fisik']]), selisih: angka_(r[k.Selisih]),
    catatan: String(r[k.Catatan] || ''),
  };
}

/** Shift terbuka milik username (sheet Shift kecil: dibaca penuh). */
function cariShiftAktif_(username) {
  const t = bacaTabel_(SHEET.SHIFT);
  for (let i = t.baris.length - 1; i >= 0; i--) {
    const s = shiftDariBaris_(t, t.baris[i], i);
    if (s.id && s.status === 'Buka' && s.kasir === username) return { tabel: t, idx: i, shift: s };
  }
  return null;
}

function cariShiftId_(id) {
  if (!id) return null;
  const t = bacaTabel_(SHEET.SHIFT);
  for (let i = t.baris.length - 1; i >= 0; i--) {
    const s = shiftDariBaris_(t, t.baris[i], i);
    if (s.id === id) return { tabel: t, idx: i, shift: s };
  }
  return null;
}

/** Transaksi kasir & entri kas milik shift, sejak shift dibuka sampai `sampai`. */
function kumpulkanShift_(shift, sampai, tz) {
  const mulai = shift.buka instanceof Date ? shift.buka.getTime() : 0;
  const akhir = sampai.getTime();
  const trx = [];
  telusuriMundur_(SHEET.TRANSAKSI, function (r, i, t) {
    const tgl = r[t.kol.Tanggal];
    if (!(tgl instanceof Date)) return true;
    if (tgl.getTime() < mulai) return false;
    if (tgl.getTime() > akhir) return true;
    if (String(r[t.kol.Kasir]).toLowerCase() !== shift.kasir) return true;
    trx.push({ metode: String(r[t.kol.Metode]), status: String(r[t.kol.Status]), total: angka_(r[t.kol.Total]) });
    return true;
  });
  const kas = [];
  telusuriMundur_(SHEET.KAS, function (r, i, t) {
    const tgl = r[t.kol.Tanggal];
    if (tgl instanceof Date && tgl.getTime() < mulai) return false;
    if (String(r[t.kol.Shift]) === shift.id) {
      kas.push({
        id: String(r[t.kol.ID]), tanggal: formatWaktu_(tgl, tz || Session.getScriptTimeZone()), jenis: String(r[t.kol.Jenis]),
        kategori: String(r[t.kol.Kategori]), jumlah: angka_(r[t.kol.Jumlah]), keterangan: String(r[t.kol.Keterangan] || ''),
      });
    }
    return true;
  });
  return { trx: trx, kas: kas };
}

/** Entri kas dalam rentang tanggal, terbaru dulu. */
function kumpulkanKas_(rentang, tz) {
  const pengguna = petaPengguna_();
  const hasil = [];
  telusuriMundur_(SHEET.KAS, function (r, i, t) {
    const tgl = r[t.kol.Tanggal];
    if (!(tgl instanceof Date)) return true;
    const waktu = Utilities.formatDate(tgl, tz, 'yyyy-MM-dd HH:mm');
    const hari = waktu.slice(0, 10);
    if (hari < rentang.dari) return false;
    if (hari > rentang.sampai) return true;
    const user = String(r[t.kol.User]).toLowerCase();
    hasil.push({
      id: String(r[t.kol.ID]), tanggal: waktu, jenis: String(r[t.kol.Jenis]), kategori: String(r[t.kol.Kategori]),
      jumlah: angka_(r[t.kol.Jumlah]), keterangan: String(r[t.kol.Keterangan] || ''), user: user,
      namaUser: pengguna[user] ? pengguna[user].nama : user, shift: String(r[t.kol.Shift] || ''),
    });
    return true;
  });
  return hasil;
}

/**
 * Bentuk rekap shift untuk klien & struk (tanpa Date). Shift terbuka dihitung langsung (berjalan);
 * shift tertutup memakai angka snapshot yang tersimpan.
 */
function susunRekapShift_(shift, toko, sekarang, rekapSiap) {
  let r = rekapSiap;
  let entriKas = null;
  if (!r && shift.status === 'Buka') {
    const d = kumpulkanShift_(shift, sekarang, toko.zonaWaktu);
    r = rekapShift_(shift.modalAwal, d.trx, d.kas);
    entriKas = d.kas;
  }
  if (!r) {
    r = {
      modalAwal: shift.modalAwal, jumlahTrx: shift.jumlahTrx, batal: 0, penjualanTunai: shift.penjualanTunai,
      penjualanNonTunai: shift.penjualanNonTunai, kasMasuk: shift.kasMasuk, kasKeluar: shift.kasKeluar, kasSeharusnya: shift.kasSeharusnya,
    };
  }
  const pengguna = petaPengguna_();
  const hasil = Object.assign({}, r, {
    id: shift.id, kasir: shift.kasir, namaKasir: pengguna[shift.kasir] ? pengguna[shift.kasir].nama : shift.kasir,
    status: shift.status, buka: formatWaktu_(shift.buka, toko.zonaWaktu), tutup: formatWaktu_(shift.tutup, toko.zonaWaktu),
    kasFisik: shift.status === 'Tutup' ? shift.kasFisik : null, selisih: shift.status === 'Tutup' ? shift.selisih : null,
    catatan: shift.catatan,
    // Daftar kas hanya untuk shift yang sedang berjalan (terbaru dulu).
    kas: entriKas,
    toko: { nama: toko.nama, alamat: toko.alamat, telepon: toko.telepon, lebarStruk: toko.lebarStruk },
  });
  hasil.teks = rekapTeks_(hasil, kolomStruk_(toko.lebarStruk));
  return hasil;
}
