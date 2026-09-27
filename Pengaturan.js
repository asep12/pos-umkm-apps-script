/**
 * Pengaturan.js — pengaturan toko (sheet Pengaturan, format Kunci | Nilai) dan kelola pengguna.
 */

function pengaturanDefault_() {
  return {
    NAMA_USAHA: 'Nama Usaha',
    ALAMAT: '',
    TELEPON: '',
    MODE_USAHA: 'Campuran',
    PAJAK_PERSEN: 0,
    FOOTER_STRUK: 'Terima kasih atas kunjungan Anda',
    LEBAR_STRUK: 58,
    PREFIX_NOTA: 'INV',
    ZONA_WAKTU: Session.getScriptTimeZone(),
    IZINKAN_STOK_MINUS: 'Tidak',
    WAJIB_BUKA_KASIR: 'Tidak',
    VERSI: VERSI,
  };
}

/** Pengaturan dari cache (untuk tampilan). */
function bacaPengaturan_() {
  return denganCache_('atur', bacaPengaturanSegar_);
}

/** Pengaturan langsung dari sheet (untuk transaksi). */
function bacaPengaturanSegar_() {
  const t = bacaTabel_(SHEET.PENGATURAN);
  const atur = pengaturanDefault_();
  t.baris.forEach(function (r) {
    const kunci = String(r[t.kol.Kunci]).trim();
    if (!kunci) return;
    const nilai = r[t.kol.Nilai];
    // Nilai Date tidak boleh dikirim ke klien; simpan sebagai teks.
    atur[kunci] = nilai instanceof Date ? nilai.toISOString() : nilai;
  });
  return atur;
}

/** Bentuk pengaturan yang aman dan sudah dinormalisasi untuk frontend & struk. */
function infoToko_(atur) {
  const prefix = String(atur.PREFIX_NOTA || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  const mode = String(atur.MODE_USAHA);
  return {
    nama: String(atur.NAMA_USAHA || ''),
    alamat: String(atur.ALAMAT || ''),
    telepon: String(atur.TELEPON || ''),
    footer: String(atur.FOOTER_STRUK || ''),
    lebarStruk: Number(atur.LEBAR_STRUK) === 80 ? 80 : 58,
    mode: ['Retail', 'F&B', 'Campuran'].indexOf(mode) === -1 ? 'Campuran' : mode,
    pajakPersen: Math.max(0, angka_(atur.PAJAK_PERSEN)),
    prefixNota: prefix || 'INV',
    izinkanStokMinus: String(atur.IZINKAN_STOK_MINUS) === 'Ya',
    wajibBukaKasir: String(atur.WAJIB_BUKA_KASIR) === 'Ya',
    zonaWaktu: zonaWaktu_(atur),
    versi: VERSI,
  };
}

function getPengaturan(token) {
  return jalankan_(token, ROLE.KASIR, function () {
    return infoToko_(bacaPengaturan_());
  });
}

function simpanPengaturan(token, input) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const nilai = normalisasiPengaturan_(input);
    denganKunci_(function () {
      const t = bacaTabel_(SHEET.PENGATURAN);
      const kolNilai = t.kol.Nilai;
      const posisi = {};
      t.baris.forEach(function (r, i) {
        const k = String(r[t.kol.Kunci]).trim();
        if (k) posisi[k] = i;
      });
      // Tulis ulang seluruh kolom Nilai sekali; teks lama dilindungi ulang dengan apostrof.
      const kolom = t.baris.map(function (r) { return typeof r[kolNilai] === 'string' ? amanSel_(r[kolNilai]) : r[kolNilai]; });
      const baru = [];
      Object.keys(nilai).forEach(function (k) {
        const v = typeof nilai[k] === 'string' ? amanSel_(nilai[k]) : nilai[k];
        if (k in posisi) kolom[posisi[k]] = v;
        else baru.push({ Kunci: k, Nilai: v });
      });
      tulisKolom_(t, 'Nilai', kolom);
      tambahObjek_(t, baru);
      naikkanVersi_('atur');
    });
    return infoToko_(bacaPengaturanSegar_());
  });
}

function listPengguna(token) {
  return jalankan_(token, ROLE.ADMIN, function () {
    const t = bacaTabel_(SHEET.PENGGUNA);
    return t.baris
      .map(function (r) { return penggunaDariBaris_(t, r); })
      .filter(function (p) { return p.username; });
  });
}

/**
 * Tambah/ubah pengguna. Pengguna baru & reset PIN mendapat PIN sementara acak (dikembalikan sekali
 * ke Admin) dan wajib ganti PIN saat login. Hash/salt tidak pernah dikirim ke klien.
 */
function simpanPengguna(token, input) {
  return jalankan_(token, ROLE.ADMIN, function (sesi) {
    const d = normalisasiPengguna_(input);
    return denganKunci_(function () {
      const t = bacaTabel_(SHEET.PENGGUNA);
      const daftar = [];
      let idx = -1;
      t.baris.forEach(function (r, i) {
        const p = penggunaDariBaris_(t, r);
        if (!p.username) return;
        daftar.push(p);
        if (p.username === d.username) idx = i;
      });
      if (d.baru && idx !== -1) throw galat_('VALIDASI', 'Username ' + d.username + ' sudah dipakai.');
      if (!d.baru && idx === -1) throw galat_('TIDAK_ADA', 'Pengguna tidak ditemukan.');
      if (d.username === sesi.u && (!d.aktif || d.role !== ROLE.ADMIN)) {
        throw galat_('VALIDASI', 'Anda tidak bisa menonaktifkan atau menurunkan peran akun sendiri.');
      }
      const setelah = daftar
        .filter(function (p) { return p.username !== d.username; })
        .concat([{ role: d.role, aktif: d.aktif }]);
      if (!adaAdminAktif_(setelah)) throw galat_('VALIDASI', 'Harus ada minimal satu Admin aktif.');

      const nilai = { Username: d.username, Nama: amanSel_(d.nama), Role: d.role, Aktif: d.aktif ? 'Ya' : 'Tidak' };
      let pin = null;
      if (d.baru || d.resetPin) {
        pin = buatPinAcak_();
        const salt = Utilities.getUuid();
        nilai['PIN Hash'] = hashPin_(salt, pin);
        nilai.Salt = salt;
        nilai['Ganti PIN'] = 'Ya';
        CacheService.getScriptCache().remove('gagal:' + d.username);
      }
      if (d.baru) tambahObjek_(t, [nilai]);
      else tulisBaris_(t, idx, keBaris_(t, nilai, t.baris[idx]));
      naikkanVersi_('user');

      const lama = idx === -1 ? null : penggunaDariBaris_(t, t.baris[idx]);
      return {
        pengguna: { username: d.username, nama: d.nama, role: d.role, aktif: d.aktif, gantiPin: pin ? true : !!(lama && lama.gantiPin) },
        pinSementara: pin,
      };
    });
  });
}
