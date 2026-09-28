/**
 * Code.js — pintu masuk Web App, menu Spreadsheet, dan pembungkus API.
 * Semua fungsi internal berakhiran "_" agar tidak bisa dipanggil lewat google.script.run.
 */

const ROLE = Object.freeze({ PUBLIK: 'Publik', KASIR: 'Kasir', ADMIN: 'Admin' });

// File HTML yang boleh di-include; mencegah include() dipakai membaca file lain.
const FILE_INCLUDE = Object.freeze(['Css', 'Js']);

function doGet() {
  let judul = 'POS';
  try {
    judul = bacaPengaturan_().NAMA_USAHA || 'POS';
  } catch (e) {
    // Sheet belum di-setup: tetap tampilkan aplikasi, pesan muncul saat login.
  }
  const templat = HtmlService.createTemplateFromFile('Index');
  // Dicetak lewat tag <?= ?> yang otomatis meng-escape HTML.
  templat.namaToko = String(judul);
  return templat
    .evaluate()
    .setTitle(String(judul))
    // Tag meta viewport di dalam HTML diabaikan HtmlService, jadi wajib lewat addMetaTag.
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content');
}

function include(nama) {
  if (FILE_INCLUDE.indexOf(nama) === -1) return '';
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('POS')
    .addItem('Setup Awal', 'setupAwal')
    .addItem('Contoh Data', 'contohData')
    .addSeparator()
    .addItem('Jalankan Tes Logika', 'jalankanTes')
    .addToUi();
}

/**
 * Pembungkus semua API publik: cek sesi & role, tangkap semua error.
 * opsi.bolehGantiPin: fungsi tetap boleh dipanggil saat pengguna wajib ganti PIN.
 */
function jalankan_(token, role, fn, opsi) {
  try {
    const sesi = role === ROLE.PUBLIK ? null : cekSesi_(token, role, opsi && opsi.bolehGantiPin);
    return { ok: true, data: fn(sesi) };
  } catch (e) {
    return responsGalat_(e);
  }
}

function galat_(kode, pesan) {
  const e = new Error(pesan);
  e.kode = kode;
  e.bisnis = true;
  return e;
}

function responsGalat_(e) {
  if (e && e.bisnis) return { ok: false, kode: e.kode, pesan: e.message };
  // Detail teknis hanya ke log server; klien cukup pesan umum.
  console.error('Galat server: ' + (e && e.stack ? e.stack : e));
  return { ok: false, kode: 'SERVER', pesan: 'Terjadi kesalahan di server. Silakan coba lagi.' };
}

/** Jalankan fn di dalam script lock. Dipakai semua operasi yang mengubah Item/stok/nota/pengguna. */
function denganKunci_(fn) {
  const kunci = LockService.getScriptLock();
  if (!kunci.tryLock(10000)) {
    throw galat_('SIBUK', 'Sistem sedang sibuk melayani kasir lain. Silakan coba lagi.');
  }
  try {
    const hasil = fn();
    SpreadsheetApp.flush();
    return hasil;
  } finally {
    kunci.releaseLock();
  }
}

/** Menolak pemanggilan dari Web App: getUi() hanya tersedia bila dijalankan dari Spreadsheet. */
function pastikanDariSpreadsheet_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    throw new Error('Fungsi ini hanya bisa dijalankan dari menu POS di Spreadsheet.');
  }
}

function zonaWaktu_(atur) {
  return (atur && atur.ZONA_WAKTU) || Session.getScriptTimeZone();
}

function formatWaktu_(tanggal, tz) {
  if (!(tanggal instanceof Date)) return String(tanggal || '');
  return Utilities.formatDate(tanggal, tz, 'yyyy-MM-dd HH:mm');
}
