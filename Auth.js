/**
 * Auth.js — login PIN, sesi di CacheService, batas percobaan, ganti PIN.
 * JANGAN menulis PIN, hash, salt, atau token ke log.
 */

const SESI_TTL = 21600; // 6 jam (maksimum CacheService)
const MAKS_GAGAL_LOGIN = 5;
const KUNCI_LOGIN_DETIK = 600; // 10 menit

function login(username, pin) {
  return jalankan_(null, ROLE.PUBLIK, function () {
    return prosesLogin_(username, pin);
  });
}

function logout(token) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    CacheService.getScriptCache().remove('sesi:' + sesi.token);
    return true;
  }, { bolehGantiPin: true });
}

function infoSesi(token) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    return dataSesi_(sesi);
  }, { bolehGantiPin: true });
}

function gantiPin(token, pinLama, pinBaru) {
  return jalankan_(token, ROLE.KASIR, function (sesi) {
    return prosesGantiPin_(sesi, String(pinLama || ''), String(pinBaru || ''));
  }, { bolehGantiPin: true });
}

// ---------- Internal ----------

function prosesLogin_(username, pin) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(pin || '');
  if (!u || u.length > 50 || !validPin_(p)) throw galat_('VALIDASI', 'Username atau PIN salah.');

  const cache = CacheService.getScriptCache();
  const kunciGagal = 'gagal:' + u;
  // Cek batas + verifikasi + catat gagal di dalam kunci: tanpa kunci, permintaan paralel membaca hitungan yang sama
  // sehingga penyerang bisa mencoba jauh lebih dari MAKS_GAGAL_LOGIN PIN per jendela penguncian.
  const user = denganKunci_(function () {
    const gagal = Number(cache.get(kunciGagal) || 0);
    if (gagal >= MAKS_GAGAL_LOGIN) {
      throw galat_('TERKUNCI', 'Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');
    }
    const calon = cariPenggunaLengkap_(u);
    // Pesan sama untuk username tidak ada / PIN salah / nonaktif agar username tidak bisa ditebak.
    if (!calon || !calon.aktif || hashPin_(calon.salt, p) !== calon.hash) {
      cache.put(kunciGagal, String(gagal + 1), KUNCI_LOGIN_DETIK);
      throw galat_('VALIDASI', 'Username atau PIN salah.');
    }
    cache.remove(kunciGagal);
    return calon;
  });

  const token = Utilities.getUuid();
  simpanSesi_(token, { u: user.username, r: user.role });
  return Object.assign({ token: token }, dataSesi_({ u: user.username, r: user.role, nama: user.nama, gp: user.gantiPin }));
}

function prosesGantiPin_(sesi, pinLama, pinBaru) {
  if (!validPin_(pinBaru)) throw galat_('VALIDASI', 'PIN baru harus 4–6 digit angka.');
  if (pinBaru === pinLama) throw galat_('VALIDASI', 'PIN baru tidak boleh sama dengan PIN lama.');
  if (pinLemah_(pinBaru)) throw galat_('VALIDASI', 'PIN terlalu mudah ditebak (angka sama/berurutan). Pilih PIN lain.');

  const cache = CacheService.getScriptCache();
  const kunciGagal = 'gagal:' + sesi.u;

  denganKunci_(function () {
    // Di dalam kunci, sama seperti login (lihat prosesLogin_).
    if (Number(cache.get(kunciGagal) || 0) >= MAKS_GAGAL_LOGIN) {
      throw galat_('TERKUNCI', 'Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.');
    }
    const t = bacaTabel_(SHEET.PENGGUNA);
    const idx = t.baris.findIndex(function (r) {
      return String(r[t.kol.Username]).trim().toLowerCase() === sesi.u;
    });
    if (idx === -1) throw galat_('SESI_HABIS', 'Akun tidak ditemukan. Silakan login ulang.');
    const row = t.baris[idx];
    if (hashPin_(String(row[t.kol.Salt]), pinLama) !== String(row[t.kol['PIN Hash']])) {
      cache.put(kunciGagal, String(Number(cache.get(kunciGagal) || 0) + 1), KUNCI_LOGIN_DETIK);
      throw galat_('VALIDASI', 'PIN lama salah.');
    }
    const salt = Utilities.getUuid();
    const baru = keBaris_(t, { 'PIN Hash': hashPin_(salt, pinBaru), Salt: salt, 'Ganti PIN': 'Tidak' }, row);
    tulisBaris_(t, idx, baru);
    naikkanVersi_('user');
  });
  cache.remove(kunciGagal);
  return true;
}

function hashPin_(salt, pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + pin, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** PIN acak 6 digit yang tidak lemah, dari UUID (lebih acak daripada Math.random). */
function buatPinAcak_() {
  for (;;) {
    const hex = Utilities.getUuid().replace(/-/g, '');
    const pin = String(parseInt(hex.slice(0, 12), 16) % 1000000).padStart(6, '0');
    if (!pinLemah_(pin)) return pin;
  }
}

function penggunaDariBaris_(t, r) {
  return {
    username: String(r[t.kol.Username]).trim().toLowerCase(),
    nama: String(r[t.kol.Nama] || ''),
    role: r[t.kol.Role] === ROLE.ADMIN ? ROLE.ADMIN : ROLE.KASIR,
    aktif: r[t.kol.Aktif] === 'Ya',
    gantiPin: r[t.kol['Ganti PIN']] === 'Ya',
  };
}

/** Termasuk hash & salt. Hanya untuk login/ganti PIN; tidak pernah di-cache. */
function cariPenggunaLengkap_(username) {
  const t = bacaTabel_(SHEET.PENGGUNA);
  const r = t.baris.find(function (row) {
    return String(row[t.kol.Username]).trim().toLowerCase() === username;
  });
  if (!r) return null;
  return Object.assign(penggunaDariBaris_(t, r), {
    hash: String(r[t.kol['PIN Hash']]),
    salt: String(r[t.kol.Salt]),
  });
}

/** Peta username -> data publik pengguna (tanpa hash/salt), di-cache berversi. */
function petaPengguna_() {
  return denganCache_('user', function () {
    const t = bacaTabel_(SHEET.PENGGUNA);
    const peta = {};
    t.baris.forEach(function (r) {
      const p = penggunaDariBaris_(t, r);
      if (p.username) peta[p.username] = p;
    });
    return peta;
  });
}

function simpanSesi_(token, isi) {
  CacheService.getScriptCache().put('sesi:' + token, JSON.stringify(isi), SESI_TTL);
}

/**
 * Validasi token dan role. Role & status aktif selalu diambil dari data pengguna terbaru,
 * sehingga menonaktifkan kasir langsung berlaku.
 */
function cekSesi_(token, roleWajib, bolehGantiPin) {
  if (typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) {
    throw galat_('SESI_HABIS', 'Sesi berakhir. Silakan login kembali.');
  }
  const cache = CacheService.getScriptCache();
  const mentah = cache.get('sesi:' + token);
  if (!mentah) throw galat_('SESI_HABIS', 'Sesi berakhir. Silakan login kembali.');
  const isi = JSON.parse(mentah);
  const user = petaPengguna_()[isi.u];
  if (!user || !user.aktif) {
    cache.remove('sesi:' + token);
    throw galat_('SESI_HABIS', 'Akun tidak aktif. Hubungi Admin.');
  }
  const sesi = { token: token, u: user.username, r: user.role, nama: user.nama, gp: user.gantiPin };
  if (sesi.gp && !bolehGantiPin) throw galat_('WAJIB_GANTI_PIN', 'Anda harus mengganti PIN terlebih dahulu.');
  if (roleWajib === ROLE.ADMIN && sesi.r !== ROLE.ADMIN) {
    throw galat_('AKSES_DITOLAK', 'Fitur ini hanya untuk Admin.');
  }
  simpanSesi_(token, { u: sesi.u, r: sesi.r }); // perpanjang masa berlaku
  return sesi;
}

function dataSesi_(sesi) {
  return { username: sesi.u, nama: sesi.nama, role: sesi.r, wajibGantiPin: !!sesi.gp };
}
