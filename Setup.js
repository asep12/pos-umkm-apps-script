/**
 * Setup.js — Setup Awal (idempotent, sekaligus migrasi kolom) dan Contoh Data.
 * Hanya boleh dijalankan dari menu POS di Spreadsheet.
 */

/**
 * Dropdown per sheet/kolom. Berupa fungsi (bukan konstanta) karena merujuk konstanta file lain;
 * urutan pemuatan file Apps Script tidak dijamin.
 */
function validasiKolom_() {
  return {
    Item: { Tipe: TIPE, 'Lacak Stok': ['Ya', 'Tidak'], Aktif: ['Ya', 'Tidak'] },
    Transaksi: { Metode: METODE, Status: ['Lunas', 'Menunggu', 'Batal'] },
    Stok_Log: { Jenis: ['Masuk', 'Keluar', 'Opname', 'Jual', 'Void', 'Koreksi'] },
    Pengguna: { Role: [ROLE.ADMIN, ROLE.KASIR], Aktif: ['Ya', 'Tidak'], 'Ganti PIN': ['Ya', 'Tidak'] },
    Kas: { Jenis: ['Masuk', 'Keluar'], Kategori: KATEGORI_KAS.Masuk.concat(KATEGORI_KAS.Keluar) },
    Shift: { Status: ['Buka', 'Tutup'] },
    Bill: { Status: ['Terbuka', 'Dibayar', 'Batal'] },
  };
}

const FORMAT_UANG = '#,##0';
const FORMAT_QTY = '#,##0.###';
const FORMAT_WAKTU = 'yyyy-mm-dd hh:mm';

const FORMAT_KOLOM = Object.freeze({
  Item: { 'Harga Beli': FORMAT_UANG, 'Harga Jual': FORMAT_UANG, Stok: FORMAT_QTY, 'Stok Min': FORMAT_QTY },
  Resep: { Qty: FORMAT_QTY },
  Transaksi: {
    Tanggal: FORMAT_WAKTU, Subtotal: FORMAT_UANG, Diskon: FORMAT_UANG, Pajak: FORMAT_UANG,
    Total: FORMAT_UANG, Bayar: FORMAT_UANG, Kembalian: FORMAT_UANG,
  },
  Detail: { Qty: FORMAT_QTY, Harga: FORMAT_UANG, Subtotal: FORMAT_UANG, 'HPP Satuan': FORMAT_UANG },
  Stok_Log: { Tanggal: FORMAT_WAKTU, Qty: FORMAT_QTY, 'Stok Sesudah': FORMAT_QTY },
  Kas: { Tanggal: FORMAT_WAKTU, Jumlah: FORMAT_UANG },
  Bill: { Dibuat: FORMAT_WAKTU, Diperbarui: FORMAT_WAKTU },
  Shift: {
    Buka: FORMAT_WAKTU, Tutup: FORMAT_WAKTU, 'Modal Awal': FORMAT_UANG, 'Penjualan Tunai': FORMAT_UANG, 'Penjualan Non Tunai': FORMAT_UANG,
    'Kas Masuk': FORMAT_UANG, 'Kas Keluar': FORMAT_UANG, 'Kas Seharusnya': FORMAT_UANG, 'Kas Fisik': FORMAT_UANG, Selisih: FORMAT_UANG,
  },
  Harga_Log: {
    Tanggal: FORMAT_WAKTU, 'Harga Beli Lama': FORMAT_UANG, 'Harga Beli Baru': FORMAT_UANG,
    'Harga Jual Lama': FORMAT_UANG, 'Harga Jual Baru': FORMAT_UANG,
  },
});

function setupAwal() {
  const ui = pastikanDariSpreadsheet_();
  let hasil;
  try {
    hasil = denganKunci_(jalankanSetup_);
  } catch (e) {
    ui.alert('Setup Awal gagal', e.message, ui.ButtonSet.OK);
    return;
  }
  ui.showModalDialog(
    HtmlService.createHtmlOutput(htmlRingkasanSetup_(hasil)).setWidth(520).setHeight(520),
    'Setup Awal POS'
  );
}

function contohData() {
  const ui = pastikanDariSpreadsheet_();
  const jawab = ui.alert(
    'Contoh Data',
    'Tambahkan ±55 item contoh (sembako, minuman, kebersihan, bahan & menu + resep) untuk uji coba?\nHanya item yang namanya belum ada yang ditambahkan.',
    ui.ButtonSet.YES_NO
  );
  if (jawab !== ui.Button.YES) return;
  try {
    const jumlah = denganKunci_(isiContohData_);
    ui.alert('Contoh Data', jumlah + ' item contoh berhasil ditambahkan.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Contoh Data', e.message, ui.ButtonSet.OK);
  }
}

// ---------- Internal ----------

function jalankanSetup_() {
  const ss = SpreadsheetApp.getActive();
  const laporan = [];
  Object.keys(SKEMA).forEach(function (nama) {
    laporan.push(nama + ': ' + siapkanSheet_(ss, nama));
  });
  hapusSheetBawaanKosong_(ss);

  const kunciBaru = lengkapiPengaturan_();
  laporan.push(kunciBaru.length ? 'Pengaturan baru: ' + kunciBaru.join(', ') : 'Pengaturan: lengkap');

  const admin = buatAdminDefault_();
  ['item', 'atur', 'user'].forEach(naikkanVersi_);
  return { laporan: laporan, admin: admin };
}

/** Buat sheet bila belum ada; tambah header yang hilang di ujung kanan. Mengembalikan keterangan. */
function siapkanSheet_(ss, nama) {
  const harus = SKEMA[nama];
  let sheet = ss.getSheetByName(nama);
  let ket;
  if (!sheet) {
    sheet = ss.insertSheet(nama);
    sheet.getRange(1, 1, 1, harus.length).setValues([harus]);
    ket = 'dibuat';
  } else {
    const lebar = sheet.getLastColumn();
    const ada = lebar ? sheet.getRange(1, 1, 1, lebar).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    const hilang = harus.filter(function (h) { return ada.indexOf(h) === -1; });
    if (hilang.length) {
      sheet.getRange(1, ada.length + 1, 1, hilang.length).setValues([hilang]);
      ket = 'kolom ditambah (' + hilang.join(', ') + ')';
    } else {
      ket = 'ok';
    }
  }
  const lebarAkhir = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, lebarAkhir).setFontWeight('bold').setBackground('#eef2f7');
  sheet.setFrozenRows(1);
  terapkanValidasiDanFormat_(sheet, nama);
  return ket;
}

function terapkanValidasiDanFormat_(sheet, nama) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  const jumlahBaris = Math.max(sheet.getMaxRows() - 1, 1);
  const validasi = validasiKolom_()[nama] || {};
  Object.keys(validasi).forEach(function (kolom) {
    const i = header.indexOf(kolom);
    if (i === -1) return;
    const aturan = SpreadsheetApp.newDataValidation().requireValueInList(validasi[kolom], true).setAllowInvalid(false).build();
    sheet.getRange(2, i + 1, jumlahBaris, 1).setDataValidation(aturan);
  });
  const format = FORMAT_KOLOM[nama] || {};
  Object.keys(format).forEach(function (kolom) {
    const i = header.indexOf(kolom);
    if (i !== -1) sheet.getRange(2, i + 1, jumlahBaris, 1).setNumberFormat(format[kolom]);
  });
}

/** Spreadsheet baru punya sheet bawaan kosong ("Sheet1"/"Lembar1"); hapus bila benar-benar kosong. */
function hapusSheetBawaanKosong_(ss) {
  ['Sheet1', 'Sheet 1', 'Lembar1', 'Lembar 1'].forEach(function (nama) {
    const sh = ss.getSheetByName(nama);
    if (sh && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
}

/** Tambah kunci yang belum ada; VERSI selalu diperbarui. */
function lengkapiPengaturan_() {
  const t = bacaTabel_(SHEET.PENGATURAN);
  const bawaan = pengaturanDefault_();
  const ada = {};
  t.baris.forEach(function (r, i) {
    const k = String(r[t.kol.Kunci]).trim();
    if (k) ada[k] = i;
  });
  const baru = Object.keys(bawaan).filter(function (k) { return !(k in ada); });
  tambahObjek_(t, baru.map(function (k) { return { Kunci: k, Nilai: bawaan[k] }; }));
  if ('VERSI' in ada) tulisSel_(t, ada.VERSI, 'Nilai', VERSI);
  return baru;
}

/** Buat akun admin bila belum ada pengguna sama sekali. Mengembalikan {username, pin} atau null. */
function buatAdminDefault_() {
  const t = bacaTabel_(SHEET.PENGGUNA);
  const adaPengguna = t.baris.some(function (r) { return String(r[t.kol.Username]).trim() !== ''; });
  if (adaPengguna) return null;
  const pin = buatPinAcak_();
  const salt = Utilities.getUuid();
  tambahObjek_(t, [{
    Username: 'admin', Nama: 'Administrator', 'PIN Hash': hashPin_(salt, pin), Salt: salt,
    Role: ROLE.ADMIN, Aktif: 'Ya', 'Ganti PIN': 'Ya',
  }]);
  return { username: 'admin', pin: pin };
}

function escHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function htmlRingkasanSetup_(hasil) {
  const daftar = hasil.laporan.map(function (l) { return '<li>' + escHtml_(l) + '</li>'; }).join('');
  const admin = hasil.admin
    ? '<div class="pin"><b>Akun Admin dibuat.</b><br>Username: <code>' + escHtml_(hasil.admin.username) +
      '</code><br>PIN sementara: <code class="besar">' + escHtml_(hasil.admin.pin) + '</code><br>' +
      '<small>Catat sekarang. PIN ini hanya ditampilkan sekali dan wajib diganti saat login pertama.</small></div>'
    : '<p>Akun pengguna sudah ada, tidak ada akun baru dibuat.</p>';
  return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">' +
    '<style>.pin{background:#fff7e0;border:1px solid #f0c040;border-radius:8px;padding:12px;margin:12px 0}' +
    'code{background:#f2f2f2;padding:1px 5px;border-radius:4px}.besar{font-size:20px;letter-spacing:3px}</style>' +
    '<p>Versi aplikasi: <b>' + escHtml_(VERSI) + '</b></p><ul>' + daftar + '</ul>' + admin +
    '<b>Langkah berikutnya</b><ol>' +
    '<li>Isi sheet <b>Pengaturan</b> (NAMA_USAHA, ALAMAT, TELEPON, dll.).</li>' +
    '<li>Extensions &gt; Apps Script &gt; <b>Deploy &gt; New deployment</b> &gt; tipe <b>Web app</b>: ' +
    'Execute as <b>Me</b>, Who has access <b>Anyone</b>.</li>' +
    '<li>Buka URL Web App, login sebagai admin, ganti PIN.</li>' +
    '<li>Bagikan URL Web App ke kasir. <b>Jangan</b> bagikan Spreadsheet ini.</li></ol></div>';
}
